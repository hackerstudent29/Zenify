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
    // To make colors travel to the other sides of the screen without wild spinning,
    // we slowly pan the UV coordinates back and forth in a giant sweeping motion.
    vec2 centeredUv = baseUv - 0.5;
    centeredUv *= u_zoom; // Slight zoom to give room for panning
    
    // Smooth, slow drift across the screen
    float panX = sin(u_time * 0.02) * 0.3;
    float panY = cos(u_time * 0.015) * 0.3;
    centeredUv += vec2(panX, panY);
    
    // 4. Local Liquid Distortion
    // Slow flowing liquid motion
    float n1 = snoise(centeredUv * 1.2 + u_time * 0.015);
    float n2 = snoise(centeredUv * 1.6 - u_time * 0.012);
    float n3 = snoise(centeredUv * 0.7 + vec2(u_time * 0.01, -u_time * 0.01));
    
    // Displacement for smooth liquid stretching
    vec2 warp = vec2(n1 + n3, n2 - n3) * 0.22;
    
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

export function LiquidBackground({ 
  coverUrl, 
  className,
  cssScale = 1.2,
  shaderZoom = 0.8,
  speedMultiplier = 1.0
}: { 
  coverUrl: string; 
  className?: string;
  cssScale?: number;
  shaderZoom?: number;
  speedMultiplier?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = React.useState(false);

  useEffect(() => {
    setIsLoaded(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;

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

    // Texture (Initialize with pure solid black 1x1 pixel until new track image finishes loading)
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const applyFallbackTexture = () => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, fallbackPixels);
      } catch (e) {
        console.warn("[LiquidBackground] Failed to apply fallback texture:", e);
      }
      setIsLoaded(true);
    };

    const loadImage = (srcUrl: string) => {
      if (!srcUrl || srcUrl.includes("/logo.png") || srcUrl.endsWith("placeholder.jpg")) {
        applyFallbackTexture();
        return;
      }

      // Check instant in-memory cache
      if (imageCache.has(srcUrl)) {
        try {
          const cachedImg = imageCache.get(srcUrl)!;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cachedImg);
          setIsLoaded(true);
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
        try {
          imageCache.set(srcUrl, img);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        } catch (err) {
          console.warn("[LiquidBackground] WebGL texture upload error, using vibrant fallback:", err);
          applyFallbackTexture();
        }
        setIsLoaded(true);
      };
      img.onerror = () => {
        console.warn("[LiquidBackground] Failed to load cover image, applying vibrant liquid fallback:", srcUrl);
        applyFallbackTexture();
      };
    };

    loadImage(getCorsUrl(coverUrl || ""));

    // Uniforms
    const timeLoc = gl.getUniformLocation(program, "u_time");
    const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
    const zoomLoc = gl.getUniformLocation(program, "u_zoom");
    
    let animationFrameId: number;
    const startTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = rect.width > 0 ? rect.width : window.innerWidth;
      const h = rect.height > 0 ? rect.height : window.innerHeight;
      canvas.width = Math.min(Math.floor(w * 0.35 * dpr), 300);
      canvas.height = Math.min(Math.floor(h * 0.35 * dpr), 300);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    };
    
    window.addEventListener('resize', resize);
    requestAnimationFrame(resize);

    const render = (now: number) => {
      animationFrameId = requestAnimationFrame(render);

      if (canvas.width === 0 || canvas.height === 0) {
        resize();
      }
      
      const time = ((now - startTime) / 1000) * speedMultiplier;
      gl.useProgram(program);
      gl.uniform1f(timeLoc, time);
      gl.uniform1f(zoomLoc, shaderZoom);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    render(performance.now());

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(positionBuffer);
      gl.deleteTexture(texture);
    };
  }, [coverUrl, shaderZoom]);

  return (
    <div className={cn("absolute inset-0 z-0 overflow-hidden bg-black pointer-events-none", className)}>
      <div 
        className={cn(
          "absolute inset-0 transition-opacity duration-700 ease-in-out",
          isLoaded ? "opacity-100" : "opacity-0"
        )} 
        style={{ transform: `scale(${cssScale}) translateZ(0)` }}
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
          style={{ 
            filter: "blur(70px) saturate(140%) brightness(0.8)", 
            transform: "translateZ(0)",
            willChange: "transform"
          }} 
        />
      </div>
      
      {/* Premium Original Frosted Glass Overlay */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-[20px]" 
        style={{ transform: "translateZ(0)" }}
      />
    </div>
  );
}
