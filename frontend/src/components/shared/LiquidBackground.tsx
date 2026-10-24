"use client";

import React, { useEffect, useRef } from "react";
import { cn, getApiBaseUrl } from "@/lib/utils";
import { useUIStore } from "@/store/ui";

// Helper to ensure CORS is bypassed so WebGL can read the image data
function getCorsUrl(url: string) {
  if (!url || !url.startsWith("http")) return url;
  
  // Force proxy to bypass Workbox opaque caching completely
  let finalUrl = url;
  if (!finalUrl.includes("proxy-image")) {
    finalUrl = `${getApiBaseUrl()}/utils/proxy-image?url=${encodeURIComponent(finalUrl)}`;
  }
  
  return finalUrl;
}

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform sampler2D u_image;
  uniform float u_time;
  uniform float u_zoom;
  
  // Simplex 2D noise
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // 1. Calculate UVs from gl_FragCoord
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv.y = 1.0 - uv.y; // Flip Y
    
    // 2. Aspect Ratio Cover Math (Assume image is 1:1 square)
    float canvasAspect = u_resolution.x / u_resolution.y;
    vec2 scale = vec2(1.0);
    if (canvasAspect > 1.0) {
      scale.y = canvasAspect;
    } else {
      scale.x = 1.0 / canvasAspect;
    }
    vec2 baseUv = (uv - 0.5) * scale + 0.5;

    // 3. Slow Sweeping Panning
    vec2 centeredUv = baseUv - 0.5;
    centeredUv *= u_zoom; 
    
    float time = u_time * 0.15;
    
    // Domain Warping / Fractal Brownian Motion
    // This creates an infinite, non-repeating chaotic liquid flow
    vec2 q = vec2(0.0);
    q.x = snoise(centeredUv + vec2(time * 0.1, time * 0.2));
    q.y = snoise(centeredUv + vec2(time * 0.15, time * 0.1));
    
    vec2 r = vec2(0.0);
    r.x = snoise(centeredUv + 1.2 * q + vec2(1.7, 9.2) + time * 0.15);
    r.y = snoise(centeredUv + 1.2 * q + vec2(8.3, 2.8) + time * 0.12);
    
    vec2 warp = r * 0.45;
    
    // Add a very slow macro rotation to the warp field
    float c = cos(time * 0.05);
    float s = sin(time * 0.05);
    warp = vec2(warp.x * c - warp.y * s, warp.x * s + warp.y * c);
    
    vec2 finalUv = centeredUv + warp + 0.5;

    // 5. Mirrored Repeat Sampling
    vec2 mirroredUv = abs(mod(finalUv, 2.0) - 1.0);
    vec4 color = texture2D(u_image, mirroredUv);
    
    // Color Processing (Apple Music Vibrant Filter)
    color.rgb = pow(color.rgb, vec3(0.6));
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luminance), color.rgb, 1.8);
    
    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;

const imageCache = new Map<string, HTMLImageElement>();

export const LiquidBackground = React.memo(function LiquidBackground({ 
  coverUrl, 
  covers,
  className,
  cssScale = 1.2,
  shaderZoom = 0.8,
  speedMultiplier = 1.0
}: { 
  coverUrl?: string; 
  covers?: string[];
  className?: string;
  cssScale?: number;
  shaderZoom?: number;
  speedMultiplier?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speedMultiplier);
  const shaderZoomRef = useRef(shaderZoom);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const resolutionLocRef = useRef<WebGLUniformLocation | null>(null);
  const hasUploadedRealTextureRef = useRef<boolean>(false);
  const activeLoadIdRef = useRef<number>(0);
  const isDestroyedRef = useRef<boolean>(false);

  useEffect(() => {
    speedRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    shaderZoomRef.current = shaderZoom;
  }, [shaderZoom]);

  // 3x3 Neutral Dark Charcoal Matrix (#121214) for seamless ambient bloom
  const fallbackPixels = React.useMemo(() => new Uint8Array([
    18, 18, 20, 255,     18, 18, 20, 255,     18, 18, 20, 255,
    18, 18, 20, 255,     18, 18, 20, 255,     18, 18, 20, 255,
    18, 18, 20, 255,     18, 18, 20, 255,     18, 18, 20, 255
  ]), []);

  // 3x3 Signature Crimson, Vibrant Rose & Dark Obsidian Matrix for authentic Zenify fluid liquid motion on Auth pages
  const brandPixels = React.useMemo(() => new Uint8Array([
    18, 18, 20, 255,      244, 63, 94, 255,    76, 5, 25, 255,
    225, 29, 72, 255,     14, 14, 16, 255,     251, 113, 133, 255,
    158, 35, 57, 255,     24, 24, 27, 255,     244, 63, 94, 255
  ]), []);

  // 1. Initialise WebGL Context, Geometry and Render Loop ONCE
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDestroyedRef.current = false;
    
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;
    glRef.current = gl;

    // Compile Shader
    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const isBrandOrAuth = !coverUrl || coverUrl === '/logo.png' || coverUrl.includes('/logo.png');

    // Create & initialize persistent texture
    const texture = gl.createTexture();
    if (!texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, isBrandOrAuth ? brandPixels : fallbackPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Uniforms
    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
    const zoomLoc = gl.getUniformLocation(program, "u_zoom");
    resolutionLocRef.current = resolutionLoc;

    let isPaused = false;
    let isIntersecting = true;
    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulatedTime = 0;

    const onVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        cancelAnimationFrame(animationFrameId);
      } else {
        isPaused = false;
        if (!isDestroyedRef.current && isIntersecting) {
          lastTime = performance.now();
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        isIntersecting = entry.isIntersecting;
        if (isIntersecting && !isDestroyedRef.current && !isPaused && !document.hidden) {
          lastTime = performance.now();
          cancelAnimationFrame(animationFrameId);
          animationFrameId = requestAnimationFrame(render);
        }
      }, { threshold: 0 });
      observer.observe(canvas);
    }

    const resize = () => {
      if (isDestroyedRef.current || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width > 0 ? rect.width : window.innerWidth;
      const h = rect.height > 0 ? rect.height : window.innerHeight;
      canvas.width = Math.max(Math.min(Math.floor(w * 0.35 * dpr), 300), 150);
      canvas.height = Math.max(Math.min(Math.floor(h * 0.35 * dpr), 300), 150);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    };
    
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);

    const render = (now: number) => {
      if (isDestroyedRef.current || isPaused || document.hidden) return;
      animationFrameId = requestAnimationFrame(render);

      if (canvas.width === 0 || canvas.height === 0) {
        resize();
      }
      
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      accumulatedTime += dt * (speedRef.current ?? 1.0);

      gl.useProgram(program);
      gl.uniform1f(timeLoc, accumulatedTime);
      gl.uniform1f(zoomLoc, shaderZoomRef.current ?? 0.8);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    render(performance.now());

    return () => {
      isDestroyedRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
      try {
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(positionBuffer);
        gl.deleteTexture(texture);
      } catch (e) {
        // Ignore webgl context release warnings
      }
      glRef.current = null;
      textureRef.current = null;
      programRef.current = null;
    };
  }, []); // Run ONCE on mount

  // 2. Texture Updates without context teardown or flickering
  useEffect(() => {
    const gl = glRef.current;
    const texture = textureRef.current;
    if (!gl || !texture || isDestroyedRef.current) return;

    const currentLoadId = ++activeLoadIdRef.current;

    const applyFallback = (useBrand = false) => {
      // Never wipe an already active real texture back to neutral fallback
      if (hasUploadedRealTextureRef.current) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, useBrand ? brandPixels : fallbackPixels);
      } catch (e) {
        console.warn("[LiquidBackground] Failed to apply fallback texture:", e);
      }
    };

    const loadImage = (srcUrl: string) => {
      if (!srcUrl || srcUrl.includes("/logo.png") || srcUrl.endsWith("placeholder.jpg")) {
        applyFallback(srcUrl.includes("/logo.png"));
        return;
      }

      // Check instant in-memory cache for seamless 0ms swap
      if (imageCache.has(srcUrl)) {
        try {
          const cachedImg = imageCache.get(srcUrl)!;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cachedImg);
          hasUploadedRealTextureRef.current = true;
          return;
        } catch (e) {
          // Ignore stale cache element
        }
      }

      const img = new Image();
      if (srcUrl.startsWith("http")) {
        img.crossOrigin = "anonymous";
      }
      img.src = srcUrl;
      img.onload = () => {
        if (isDestroyedRef.current || activeLoadIdRef.current !== currentLoadId) return;
        try {
          imageCache.set(srcUrl, img);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          hasUploadedRealTextureRef.current = true;
        } catch (err) {
          console.warn("[LiquidBackground] WebGL texture upload error:", err);
          applyFallback();
        }
      };
      img.onerror = () => {
        if (activeLoadIdRef.current === currentLoadId) {
          console.warn("[LiquidBackground] Failed to load cover image:", srcUrl);
          applyFallback();
        }
      };
    };

    const loadMultiImages = (urls: string[]) => {
      if (!urls || urls.length === 0) {
        loadImage(getCorsUrl(coverUrl || ""));
        return;
      }

      if (urls.length === 1) {
        loadImage(getCorsUrl(urls[0]));
        return;
      }

      const canvasWidth = 512;
      const canvasHeight = 512;
      const offscreen = document.createElement("canvas");
      offscreen.width = canvasWidth;
      offscreen.height = canvasHeight;
      const ctx = offscreen.getContext("2d");
      if (!ctx) {
        loadImage(getCorsUrl(urls[0]));
        return;
      }

      ctx.fillStyle = "#121214";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      const targetUrls = urls.slice(0, 4);
      let loadedCount = 0;
      let hasUploaded = false;

      const uploadCanvasToTexture = () => {
        if (isDestroyedRef.current || activeLoadIdRef.current !== currentLoadId) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
          hasUploaded = true;
          hasUploadedRealTextureRef.current = true;
        } catch (err) {
          console.warn("[LiquidBackground] Multi-image canvas texture upload error:", err);
          if (!hasUploaded) applyFallback();
        }
      };

      const getRect = (index: number, total: number) => {
        const halfW = canvasWidth / 2;
        const halfH = canvasHeight / 2;
        if (total === 2) {
          return index === 0 
            ? { x: 0, y: 0, w: halfW, h: canvasHeight } 
            : { x: halfW, y: 0, w: halfW, h: canvasHeight };
        }
        if (total === 3) {
          if (index === 0) return { x: 0, y: 0, w: canvasWidth, h: halfH };
          if (index === 1) return { x: 0, y: halfH, w: halfW, h: halfH };
          return { x: halfW, y: halfH, w: halfW, h: halfH };
        }
        const coords = [
          { x: 0, y: 0, w: halfW, h: halfH },
          { x: halfW, y: 0, w: halfW, h: halfH },
          { x: 0, y: halfH, w: halfW, h: halfH },
          { x: halfW, y: halfH, w: halfW, h: halfH },
        ];
        return coords[index] || coords[0];
      };

      targetUrls.forEach((rawUrl, idx) => {
        const srcUrl = getCorsUrl(rawUrl);
        const rect = getRect(idx, targetUrls.length);

        const img = new Image();
        if (srcUrl.startsWith("http")) {
          img.crossOrigin = "anonymous";
        }
        img.src = srcUrl;
        img.onload = () => {
          if (isDestroyedRef.current || activeLoadIdRef.current !== currentLoadId) return;
          try {
            ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
            loadedCount++;
            uploadCanvasToTexture();
          } catch (e) {
            console.warn("[LiquidBackground] drawImage error:", e);
          }
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === targetUrls.length && !hasUploaded && activeLoadIdRef.current === currentLoadId) {
            applyFallback();
          }
        };
      });
    };

    if (covers && covers.length > 1) {
      loadMultiImages(covers);
    } else {
      loadImage(getCorsUrl(coverUrl || ""));
    }
  }, [coverUrl, covers ? covers.join(',') : '', brandPixels, fallbackPixels]);

  return (
    <div 
      className={cn("absolute inset-0 z-0 overflow-hidden bg-[#121214] pointer-events-none isolate", className)}
      style={{ transform: "translateZ(0)", backfaceVisibility: "hidden", backgroundColor: "#121214" }}
    >
      <div 
        className="absolute inset-0" 
        style={{ transform: `scale(${cssScale}) translateZ(0)`, backfaceVisibility: "hidden" }}
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
          style={{ 
            filter: "blur(60px) saturate(140%) brightness(0.8)", 
            transform: "translateZ(0)",
            willChange: "transform",
            backfaceVisibility: "hidden"
          }} 
        />
      </div>
      
      {/* Dark overlay tint */}
      <div 
        className="absolute inset-0 bg-black/30 pointer-events-none" 
        style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
      />
    </div>
  );
});
