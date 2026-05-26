import { useState, useRef, useCallback } from "react";

const GENRES = ["Electronic", "Hip-Hop", "R&B / Soul", "Pop", "Indie", "Rock", "Jazz", "Classical", "Afrobeats", "Ambient", "Lo-Fi", "Drill", "House", "Techno", "Trap"];
const TIMES = Array.from({ length: 48 }, (_, i) => { const h = Math.floor(i / 2), m = i % 2 === 0 ? "00" : "30", ap = h < 12 ? "AM" : "PM", h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${m} ${ap}`; });

// ─── Inline CSS ───────────────────────────────────────────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=Instrument+Serif:ital@0;1&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:#06050c;}
  ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(244,63,94,0.4);border-radius:3px;}
  ::selection{background:rgba(244,63,94,0.35);}
  @keyframes in{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
  @keyframes inLeft{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:translateX(0)}}
  @keyframes pulse2{0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0.4)}50%{box-shadow:0 0 0 8px rgba(244,63,94,0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes barUp{from{transform:scaleY(0.3)}to{transform:scaleY(1)}}
  .step-enter{animation:in 0.35s cubic-bezier(.22,1,.36,1) both;}
  input,textarea,select,button{font-family:inherit;}
  input:focus,textarea:focus{outline:none;}
`;

// ─── Micro Components ────────────────────────────────────────────────────────

function GlassInput({ label, placeholder, value, onChange, type = "text", multiline, rows = 4, half, prefix }) {
  const [f, setF] = useState(false);
  const baseStyle = {
    width: "100%", background: f ? "rgba(244,63,94,0.07)" : "rgba(255,255,255,0.04)",
    border: `1.5px solid ${f ? "rgba(244,63,94,0.6)" : "rgba(255,255,255,0.09)"}`,
    borderRadius: 14, color: "rgba(255,255,255,0.9)",
    fontSize: "0.92rem", fontWeight: 300, letterSpacing: "0.01em",
    padding: prefix ? "14px 16px 14px 36px" : "14px 16px",
    transition: "all 0.2s", backdropFilter: "blur(8px)",
    boxShadow: f ? "0 0 0 4px rgba(244,63,94,0.1)" : "none",
    resize: "none",
  };
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 8px)" : "1 1 100%" }}>
      <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>{label}</div>
      <div style={{ position: "relative" }}>
        {prefix && <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(139,92,246,0.7)", fontSize: "0.9rem", pointerEvents: "none", zIndex: 1 }}>{prefix}</span>}
        {multiline
          ? <textarea rows={rows} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} style={{ ...baseStyle, paddingTop: 14 }} />
          : <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} style={baseStyle} />
        }
      </div>
    </div>
  );
}

function CustomSelect({ label, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>{label}</div>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", background: open ? "rgba(244,63,94,0.07)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${open ? "rgba(244,63,94,0.6)" : "rgba(255,255,255,0.09)"}`,
        borderRadius: 14, padding: "14px 16px", color: value ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
        fontSize: "0.92rem", fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", transition: "all 0.2s",
        boxShadow: open ? "0 0 0 4px rgba(244,63,94,0.1)" : "none",
      }}>
        <span>{value || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(244,63,94,0.7)" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <>
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 91,
          background: "rgba(14,11,26,0.98)", border: "1.5px solid rgba(244,63,94,0.3)",
          borderRadius: 14, overflow: "hidden", backdropFilter: "blur(20px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)", animation: "in 0.15s ease both", maxHeight: 220, overflowY: "auto",
        }}>
          {options.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }} style={{
              width: "100%", background: value === o ? "rgba(244,63,94,0.15)" : "none", border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "12px 16px",
              color: value === o ? "rgb(251,113,133)" : "rgba(255,255,255,0.6)",
              fontSize: "0.88rem", fontWeight: 300, textAlign: "left", cursor: "pointer",
              transition: "all 0.15s",
            }} onMouseEnter={e => { if (value !== o) { e.target.style.background = "rgba(244,63,94,0.08)"; e.target.style.color = "rgba(255,255,255,0.9)"; } }}
              onMouseLeave={e => { if (value !== o) { e.target.style.background = "none"; e.target.style.color = "rgba(255,255,255,0.6)"; } }}>
              {o}
            </button>
          ))}
        </div>
      </>}
    </div>
  );
}

function MiniCalendar({ value, onChange, onClose }) {
  const today = new Date();
  const [view, setView] = useState(value ? new Date(value) : new Date(today.getFullYear(), today.getMonth(), 1));
  const y = view.getFullYear(), mo = view.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const sel = value ? new Date(value) : null;
  const isSel = d => sel && sel.getFullYear() === y && sel.getMonth() === mo && sel.getDate() === d;
  const isTod = d => today.getFullYear() === y && today.getMonth() === mo && today.getDate() === d;
  const isPast = d => new Date(y, mo, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const pick = d => { if (isPast(d)) return; onChange(new Date(y, mo, d).toLocaleDateString("en-GB")); onClose(); };
  const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (<>
    <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={onClose} />
    <div style={{
      position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
      zIndex: 200, background: "rgba(10,8,22,0.98)", border: "1.5px solid rgba(244,63,94,0.3)",
      borderRadius: 20, padding: 20, width: 270, backdropFilter: "blur(20px)",
      boxShadow: "0 30px 80px rgba(0,0,0,0.8),0 0 40px rgba(244,63,94,0.1)", animation: "in 0.18s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => setView(new Date(y, mo - 1, 1))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16, padding: "2px 8px", borderRadius: 6 }}>‹</button>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.85)" }}>{MONTHS[mo]} {y}</span>
        <button onClick={() => setView(new Date(y, mo + 1, 1))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16, padding: "2px 8px", borderRadius: 6 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
        {DAYS.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "0.56rem", color: "rgba(255,255,255,0.22)", padding: "3px 0", letterSpacing: "0.1em" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map(d => (
          <button key={d} onClick={() => pick(d)} style={{
            background: isSel(d) ? "rgba(244,63,94,1)" : isTod(d) ? "rgba(244,63,94,0.18)" : "none",
            border: `1px solid ${isSel(d) ? "transparent" : isTod(d) ? "rgba(244,63,94,0.4)" : "transparent"}`,
            borderRadius: 8, color: isPast(d) ? "rgba(255,255,255,0.12)" : isSel(d) ? "white" : "rgba(255,255,255,0.7)",
            fontSize: "0.72rem", padding: "6px 0", cursor: isPast(d) ? "default" : "pointer", textAlign: "center", transition: "all 0.15s",
            boxShadow: isSel(d) ? "0 4px 14px rgba(244,63,94,0.5)" : "none",
          }} onMouseEnter={e => { if (!isPast(d) && !isSel(d)) { e.target.style.background = "rgba(244,63,94,0.12)"; e.target.style.color = "white"; } }}
            onMouseLeave={e => { if (!isPast(d) && !isSel(d)) { e.target.style.background = isTod(d) ? "rgba(244,63,94,0.18)" : "none"; e.target.style.color = "rgba(255,255,255,0.7)"; } }}>{d}</button>
        ))}
      </div>
    </div>
  </>);
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "linear-gradient(135deg,rgba(244,63,94,0.35),rgba(190,18,60,0.25))" : "rgba(255,255,255,0.03)",
      border: `1.5px solid ${active ? "rgba(244,63,94,0.7)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 100, padding: "9px 20px", fontSize: "0.72rem", fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase", color: active ? "rgb(254,163,170)" : "rgba(255,255,255,0.35)",
      cursor: "pointer", transition: "all 0.2s",
      boxShadow: active ? "0 0 20px rgba(244,63,94,0.2)" : "none",
    }}>{label}</button>
  );
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: 400, color: "rgba(255,255,255,0.72)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.02em" }}>{sub}</div>
      </div>
      <div onClick={() => onChange(!on)} style={{
        width: 46, height: 26, borderRadius: 100, cursor: "pointer", flexShrink: 0, marginLeft: 20, position: "relative",
        background: on ? "linear-gradient(135deg,#f43f5e,#be123c)" : "rgba(255,255,255,0.07)",
        border: `1.5px solid ${on ? "transparent" : "rgba(255,255,255,0.1)"}`,
        transition: "all 0.3s", boxShadow: on ? "0 4px 16px rgba(244,63,94,0.45)" : "none",
      }}>
        <div style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 16, height: 16, borderRadius: "50%", background: on ? "#fff" : "rgba(255,255,255,0.35)", transition: "all 0.3s", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }} />
      </div>
    </div>
  );
}

// ─── Step Indicator ──────────────────────────────────────────────────────────
function StepRail({ current, steps }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 52 }}>
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        return (<>
          <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: done ? "pointer" : "default" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? "linear-gradient(135deg,#f43f5e,#be123c)" : done ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.05)",
              border: `2px solid ${active ? "#f43f5e" : done ? "rgba(244,63,94,0.5)" : "rgba(255,255,255,0.1)"}`,
              transition: "all 0.3s", boxShadow: active ? "0 0 20px rgba(244,63,94,0.5)" : "none",
              animation: active ? "pulse2 2s infinite" : "none",
            }}>
              {done
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,228,230,0.9)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                : <span style={{ fontSize: "0.65rem", fontWeight: 700, color: active ? "white" : "rgba(255,255,255,0.25)", letterSpacing: "0" }}>{i + 1}</span>
              }
            </div>
            <span style={{ fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: active ? "white" : done ? "rgba(244,63,94,0.6)" : "rgba(255,255,255,0.2)", whiteSpace: "nowrap" }}>{s}</span>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: i < current ? "rgba(244,63,94,0.4)" : "rgba(255,255,255,0.06)", margin: "0 10px", marginBottom: 22, transition: "all 0.4s" }} />}
        </>);
      })}
    </div>
  );
}

// ─── Upload Step ─────────────────────────────────────────────────────────────
function StepUpload({ coverFile, setCoverFile, coverPreview, setCoverPreview, audioFile, setAudioFile, audioName, setAudioName }) {
  const [drag, setDrag] = useState(false);
  const covRef = useRef(), audRef = useRef();

  const handleCover = f => { if (!f) return; setCoverFile(f); const r = new FileReader(); r.onload = e => setCoverPreview(e.target.result); r.readAsDataURL(f); };
  const handleAudio = f => { if (!f) return; setAudioFile(f); setAudioName(f.name); };

  return (
    <div className="step-enter" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {/* Cover Art */}
      <div>
        <SectionLabel num="A" title="Visual Identity" sub="Cover art for your release" />
        <div onClick={() => covRef.current.click()} style={{
          aspectRatio: "1", borderRadius: 20, overflow: "hidden", position: "relative", cursor: "pointer",
          background: coverPreview ? "none" : "rgba(255,255,255,0.02)",
          border: `2px dashed ${coverPreview ? "transparent" : "rgba(244,63,94,0.25)"}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          transition: "all 0.3s",
        }} onMouseEnter={e => { if (!coverPreview) e.currentTarget.style.borderColor = "rgba(244,63,94,0.5)"; e.currentTarget.style.background = "rgba(244,63,94,0.04)"; }}
          onMouseLeave={e => { if (!coverPreview) e.currentTarget.style.borderColor = "rgba(244,63,94,0.25)"; e.currentTarget.style.background = coverPreview ? "none" : "rgba(255,255,255,0.02)"; }}>
          <input ref={covRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleCover(e.target.files[0])} />
          {coverPreview
            ? <img src={coverPreview} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} alt="" />
            : <>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(244,63,94,0.12)", border: "1.5px solid rgba(244,63,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(251,113,133,0.7)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              </div>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Drop artwork here</div>
              <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", marginTop: 6 }}>JPG · PNG · 1400×1400 minimum</div>
            </>
          }
        </div>
        {coverPreview && <button onClick={e => { e.stopPropagation(); setCoverPreview(null); setCoverFile(null); }} style={{ marginTop: 10, background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.3)", fontSize: "0.68rem", padding: "5px 14px", cursor: "pointer", width: "100%", letterSpacing: "0.06em" }}>Replace Image</button>}
      </div>

      {/* Audio */}
      <div>
        <SectionLabel num="B" title="Audio Master" sub="Lossless or compressed audio file" />
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("audio")) handleAudio(f); }}
          onClick={() => audRef.current.click()} style={{
            height: 220, borderRadius: 20, border: `2px dashed ${drag ? "rgba(244,63,94,0.7)" : "rgba(255,255,255,0.09)"}`,
            background: drag ? "rgba(244,63,94,0.06)" : audioFile ? "rgba(244,63,94,0.04)" : "rgba(255,255,255,0.02)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.25s", gap: 12,
          }}>
          <input ref={audRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={e => handleAudio(e.target.files[0])} />
          {audioFile
            ? <>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(244,63,94,0.2)", border: "1.5px solid rgba(244,63,94,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(251,113,133,0.9)" strokeWidth="1.5"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg>
              </div>
              <div style={{ textAlign: "center", padding: "0 16px" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "rgba(254,163,170,0.9)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{audioName}</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)" }}>Audio loaded · Click to replace</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 32, padding: "0 8px" }}>
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2, background: `rgba(244,63,94,${0.4 + Math.random() * 0.5})`,
                    height: 6 + Math.abs(Math.sin(i * 0.8)) * 20, animation: `barUp ${0.5 + Math.random() * 0.8}s ease-in-out infinite alternate`, animationDelay: `${Math.random() * 0.5}s`
                  }} />
                ))}
              </div>
            </>
            : <>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>Drag & drop audio</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.18)", marginTop: 5 }}>WAV · FLAC · MP3 · AIFF · up to 500MB</div>
              </div>
            </>
          }
        </div>

        {/* Stability */}
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>Network Stability</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "rgba(251,113,133,0.85)" }}>99.9%</span>
          </div>
          <div style={{ height: 3, borderRadius: 100, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: "99.9%", borderRadius: 100, background: "linear-gradient(90deg,#be123c,#f43f5e,#fda4af)", boxShadow: "0 0 10px rgba(244,63,94,0.5)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Metadata Step ───────────────────────────────────────────────────────────
function StepMeta({ artist, setArtist, title, setTitle, genre, setGenre, classification, setClassification, description, setDescription }) {
  return (
    <div className="step-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <GlassInput label="Artist Name" placeholder="Enter artist name" value={artist} onChange={setArtist} half />
        <GlassInput label="Track Title" placeholder="Enter song title" value={title} onChange={setTitle} half />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 calc(50% - 8px)" }}>
          <CustomSelect label="Music Genre" value={genre} onChange={setGenre} options={GENRES} placeholder="Pick a genre…" />
        </div>
        <div style={{ flex: "0 0 calc(50% - 8px)" }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>Track Type</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Original", "Remix", "Instrumental"].map(c => <Pill key={c} label={c} active={classification === c.toLowerCase()} onClick={() => setClassification(c.toLowerCase())} />)}
          </div>
        </div>
      </div>
      <GlassInput label="Track Description" placeholder="Tell us about the track — inspiration, credits, or a story…" value={description} onChange={setDescription} multiline rows={5} />
    </div>
  );
}

// ─── Release Step ────────────────────────────────────────────────────────────
function StepRelease({ mode, setMode, schedDate, setSchedDate, schedTime, setSchedTime, unlisted, setUnlisted, downloads, setDownloads, comments, setComments, copyright, setCopyright }) {
  const [showCal, setShowCal] = useState(false);
  const cidDisplay = copyright.trim().replace(/\s+/g, "").toLowerCase();

  const RelCard = ({ value, label, sub, icon }) => {
    const active = mode === value;
    return (
      <div onClick={() => setMode(value)} style={{
        background: active ? "rgba(244,63,94,0.1)" : "rgba(255,255,255,0.02)",
        border: `1.5px solid ${active ? "rgba(244,63,94,0.55)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 16, padding: "18px 20px", cursor: "pointer", transition: "all 0.2s",
        boxShadow: active ? "inset 0 0 30px rgba(244,63,94,0.05),0 0 0 1px rgba(244,63,94,0.1)" : "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: active ? "rgba(244,63,94,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "rgba(244,63,94,0.4)" : "rgba(255,255,255,0.08)"}`, display: "flex", alignItems: "center", justifyContent: "center", color: active ? "rgb(251,113,133)" : "rgba(255,255,255,0.25)", flexShrink: 0, transition: "all 0.2s" }}>{icon}</div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.25)" }}>{sub}</div>
          </div>
        </div>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${active ? "#f43f5e" : "rgba(255,255,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e" }} />}
        </div>
      </div>
    );
  };

  return (
    <div className="step-enter" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      {/* Left: Schedule */}
      <div>
        <SectionLabel num="C" title="Release Schedule" sub="When does this go live" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <RelCard value="now" label="Publish Now" sub="Go live immediately"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>} />
          <RelCard value="schedule" label="Schedule" sub="Set a future date & time"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>} />
          <RelCard value="draft" label="Save Draft" sub="Finish later"
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>} />
        </div>
        {mode === "schedule" && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, animation: "in 0.2s ease both" }}>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>Release Date</div>
              <button onClick={() => setShowCal(!showCal)} style={{
                width: "100%", background: "rgba(255,255,255,0.04)", border: `1.5px solid ${showCal ? "rgba(244,63,94,0.6)" : "rgba(244,63,94,0.25)"}`,
                borderRadius: 14, padding: "13px 16px", color: schedDate ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
                fontSize: "0.88rem", fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
                boxShadow: showCal ? "0 0 0 4px rgba(244,63,94,0.1)" : "none", transition: "all 0.2s",
              }}>
                <span>{schedDate || "Select date…"}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(244,63,94,0.7)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </button>
              {showCal && <MiniCalendar value={schedDate} onChange={setSchedDate} onClose={() => setShowCal(false)} />}
            </div>
            <CustomSelect label="Release Time" value={schedTime} onChange={setSchedTime} options={(() => {
              if (schedDate === new Date().toLocaleDateString("en-GB")) {
                const now = new Date();
                return TIMES.filter(t => {
                  const [time, ap] = t.split(" ");
                  let [h, m] = time.split(":").map(Number);
                  if (ap === "PM" && h !== 12) h += 12;
                  if (ap === "AM" && h === 12) h = 0;
                  const chosen = new Date();
                  chosen.setHours(h, m, 0, 0);
                  return chosen.getTime() > now.getTime();
                });
              }
              return TIMES;
            })()} placeholder="Select time…" />
          </div>
        )}
      </div>

      {/* Right: Settings + Copyright */}
      <div>
        <SectionLabel num="D" title="Track Settings" sub="Visibility & permissions" />
        <Toggle on={unlisted} onChange={setUnlisted} label="Unlisted Track" sub="Only people with the link can listen" />
        <Toggle on={downloads} onChange={setDownloads} label="Allow Downloads" sub="Let listeners download this track" />
        <Toggle on={comments} onChange={setComments} label="Enable Comments" sub="Let listeners leave comments" />

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", marginBottom: 8 }}>Content ID / Copyright Label</div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(244,63,94,0.7)", fontSize: "0.9rem", pointerEvents: "none", zIndex: 1 }}>@</span>
            <input value={copyright} onChange={e => setCopyright(e.target.value)} placeholder="Label name (e.g. ram)"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(244,63,94,0.35)", borderRadius: 14, padding: "13px 16px 13px 34px", color: "rgba(255,255,255,0.9)", fontSize: "0.88rem", fontWeight: 300, outline: "none", transition: "all 0.2s", boxShadow: "0 0 0 4px rgba(244,63,94,0.06)" }}
              onFocus={e => { e.target.style.borderColor = "rgba(244,63,94,0.65)"; e.target.style.boxShadow = "0 0 0 4px rgba(244,63,94,0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(244,63,94,0.35)"; e.target.style.boxShadow = "0 0 0 4px rgba(244,63,94,0.06)"; }} />
          </div>
          {cidDisplay && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 8, padding: "5px 12px", animation: "in 0.2s ease both" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(251,113,133,0.8)", animation: "pulse2 2s infinite" }} />
              <span style={{ fontSize: "0.76rem", fontWeight: 500, color: "rgba(254,163,170,0.9)" }}>@{cidDisplay}</span>
            </div>
          )}
          <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.2)", marginTop: 6, letterSpacing: "0.05em" }}>This will be displayed as @label across the platform</div>
        </div>
      </div>
    </div>
  );
}

// ─── Review Step ─────────────────────────────────────────────────────────────
function StepReview({ artist, title, genre, classification, description, mode, schedDate, schedTime, unlisted, downloads, comments, copyright, coverPreview, audioName, certified, setCertified, onCommit }) {
  const Row = ({ label, value }) => value ? <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
    <span style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)" }}>{label}</span>
    <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", textAlign: "right", maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
  </div> : null;

  return (
    <div className="step-enter" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28 }}>
      {/* Cover thumbnail */}
      <div>
        <div style={{ aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {coverPreview ? <img src={coverPreview} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>}
        </div>
        {audioName && <div style={{ marginTop: 10, background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 10, padding: "8px 12px" }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(244,63,94,0.6)", marginBottom: 2 }}>Audio</div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{audioName}</div>
        </div>}
      </div>

      <div>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "6px 20px", marginBottom: 20 }}>
          <Row label="Artist" value={artist} />
          <Row label="Title" value={title} />
          <Row label="Genre" value={genre} />
          <Row label="Classification" value={classification} />
          <Row label="Description" value={description} />
          <Row label="Release" value={mode === "schedule" ? `Scheduled · ${schedDate} ${schedTime}` : mode === "draft" ? "Save as Draft" : "Publish Immediately"} />
          <Row label="Visibility" value={unlisted ? "Unlisted" : "Public"} />
          <Row label="Downloads" value={downloads ? "Allowed" : "Disabled"} />
          <Row label="Comments" value={comments ? "Enabled" : "Disabled"} />
          <Row label="Copyright ID" value={copyright ? `@${copyright.replace(/\s+/g, "").toLowerCase()}` : "Not Specified"} />
        </div>

        {/* Certification */}
        <div onClick={() => setCertified(!certified)} style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          background: certified ? "rgba(139,92,246,0.07)" : "rgba(255,255,255,0.02)",
          border: `1.5px solid ${certified ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.2s", marginBottom: 20,
        }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${certified ? "#f43f5e" : "rgba(255,255,255,0.15)"}`, background: certified ? "rgba(244,63,94,0.2)" : "none", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, marginTop: 1 }}>
            {certified && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 3 }}>Asset Ownership Certification</div>
            <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.28)", lineHeight: 1.5 }}>I certify that I hold the necessary digital rights to distribute this asset across the network.</div>
          </div>
        </div>

        <button onClick={onCommit} disabled={!certified} style={{
          width: "100%", padding: "17px", borderRadius: 14, border: "none",
          background: certified ? "linear-gradient(135deg,#e11d48 0%,#be123c 100%)" : "rgba(255,255,255,0.05)",
          color: certified ? "white" : "rgba(255,255,255,0.2)",
          fontSize: "0.76rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
          cursor: certified ? "pointer" : "not-allowed", transition: "all 0.3s",
          boxShadow: certified ? "0 8px 30px rgba(225,29,72,0.4)" : "none",
        }} onMouseEnter={e => { if (certified) { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 14px 40px rgba(225,29,72,0.5)"; } }}
          onMouseLeave={e => { if (certified) { e.target.style.transform = "none"; e.target.style.boxShadow = "0 8px 30px rgba(225,29,72,0.4)"; } }}
        >
          Commit Release
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ num, title, sub }) {
  return (
    <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(244,63,94,0.15)", border: "1.5px solid rgba(244,63,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "rgba(251,113,133,0.9)", flexShrink: 0 }}>{num}</div>
      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>{title}</div>
        <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.22)", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(0);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [audioName, setAudioName] = useState("");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [classification, setClassification] = useState("original");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("now");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("12:00 PM");
  const [unlisted, setUnlisted] = useState(false);
  const [downloads, setDownloads] = useState(true);
  const [comments, setComments] = useState(true);
  const [copyright, setCopyright] = useState("");
  const [certified, setCertified] = useState(false);
  const [committed, setCommitted] = useState(false);

  const STEPS = ["Media", "Metadata", "Release", "Review"];
  const canNext = [
    audioFile !== null,
    artist.trim() && title.trim() && genre,
    true,
    certified,
  ];

  if (committed) return (
    <div style={{ minHeight: "100vh", background: "#06050c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif" }}>
      <style>{G}</style>
      <div style={{ textAlign: "center", animation: "in 0.5s ease both" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#f43f5e,#be123c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: "0 0 40px rgba(244,63,94,0.5)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{ fontSize: "2rem", fontWeight: 300, color: "rgba(255,255,255,0.9)", fontFamily: "'Instrument Serif',serif", fontStyle: "italic", marginBottom: 8 }}>Track Released</h2>
        <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>{title} by {artist} is now live on the network.</p>
        <button onClick={() => { setCommitted(false); setStep(0); }} style={{ marginTop: 32, background: "rgba(244,63,94,0.15)", border: "1.5px solid rgba(244,63,94,0.35)", borderRadius: 12, color: "rgba(254,163,170,0.9)", fontSize: "0.76rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "12px 28px", cursor: "pointer" }}>Upload Another</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#06050c", backgroundImage: "radial-gradient(ellipse 70% 40% at 60% 0%,rgba(225,29,72,0.08) 0%,transparent 55%)", fontFamily: "'Sora',sans-serif", color: "rgba(255,255,255,0.85)" }}>
      <style>{G}</style>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(6,5,12,0.85)", backdropFilter: "blur(20px)", padding: "0 48px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#f43f5e,#be123c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(244,63,94,0.4)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M9 18V5l12-2v13M9 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12 0c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z" /></svg>
          </div>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, letterSpacing: "0.1em", color: "rgba(255,255,255,0.85)" }}>ZENIFY</span>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)", margin: "0 8px" }} />
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>Upload Track</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.06em" }}>Step {step + 1} of {STEPS.length}</div>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#f43f5e,#be123c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, boxShadow: "0 4px 12px rgba(244,63,94,0.3)" }}>ZK</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 48px 80px" }}>

        {/* Big heading */}
        <div style={{ marginBottom: 44 }}>
          <div style={{ fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(244,63,94,0.6)", marginBottom: 10 }}>Upload Progress — Step {step + 1}</div>
          <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 400, fontStyle: "italic", color: "rgba(255,255,255,0.92)", lineHeight: 1, letterSpacing: "-0.02em" }}>
            {["Upload <em>Audio</em>", "Track <em>Details</em>", "Release <em>Settings</em>", "Review & <em>Commit</em>"][step].replace(/<em>|<\/em>/g, "")}
          </h1>
          <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "clamp(2rem,5vw,3rem)", fontWeight: 400, fontStyle: "italic", color: "rgba(255,255,255,0.92)", lineHeight: 1, letterSpacing: "-0.02em", marginTop: -2, display: "none" }}>placeholder</h1>
        </div>

        <StepRail current={step} steps={STEPS} />

        {/* Step content */}
        <div style={{ minHeight: 340 }}>
          {step === 0 && <StepUpload coverFile={coverFile} setCoverFile={setCoverFile} coverPreview={coverPreview} setCoverPreview={setCoverPreview} audioFile={audioFile} setAudioFile={setAudioFile} audioName={audioName} setAudioName={setAudioName} />}
          {step === 1 && <StepMeta artist={artist} setArtist={setArtist} title={title} setTitle={setTitle} genre={genre} setGenre={setGenre} classification={classification} setClassification={setClassification} description={description} setDescription={setDescription} />}
          {step === 2 && <StepRelease mode={mode} setMode={setMode} schedDate={schedDate} setSchedDate={setSchedDate} schedTime={schedTime} setSchedTime={setSchedTime} unlisted={unlisted} setUnlisted={setUnlisted} downloads={downloads} setDownloads={setDownloads} comments={comments} setComments={setComments} copyright={copyright} setCopyright={setCopyright} />}
          {step === 3 && <StepReview artist={artist} title={title} genre={genre} classification={classification} description={description} mode={mode} schedDate={schedDate} schedTime={schedTime} unlisted={unlisted} downloads={downloads} comments={comments} copyright={copyright} coverPreview={coverPreview} audioName={audioName} certified={certified} setCertified={setCertified} onCommit={() => setCommitted(true)} />}
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{ background: "none", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, color: step === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "12px 28px", cursor: step === 0 ? "default" : "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => { if (step > 0) e.target.style.borderColor = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}>
            <span style={{ color: "rgba(244,63,94,0.6)", marginRight: 6 }}>←</span> Back
          </button>

          <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
            {step < 3 && !canNext[step] && ["Add an audio file to continue", "Fill artist, title & genre", "", ""][step]}
          </div>

          {step < 3 ? (
            <button onClick={() => setStep(s => Math.min(3, s + 1))} disabled={!canNext[step]} style={{
              background: canNext[step] ? "linear-gradient(135deg,#f43f5e,#be123c)" : "rgba(255,255,255,0.05)",
              border: "none", borderRadius: 12,
              color: canNext[step] ? "white" : "rgba(255,255,255,0.2)",
              fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
              padding: "12px 32px", cursor: canNext[step] ? "pointer" : "not-allowed", transition: "all 0.3s",
              boxShadow: canNext[step] ? "0 6px 24px rgba(244,63,94,0.4)" : "none",
            }} onMouseEnter={e => { if (canNext[step]) { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 10px 30px rgba(244,63,94,0.5)"; } }}
              onMouseLeave={e => { e.target.style.transform = "none"; e.target.style.boxShadow = canNext[step] ? "0 6px 24px rgba(244,63,94,0.4)" : "none"; }}>
              {step === 2 ? "Review Step" : "Next Step"}
              <span style={{ color: "rgba(255,228,230,0.7)", marginLeft: 6 }}>→</span>
            </button>
          ) : (
            <div style={{ fontSize: "0.6rem", color: "rgba(244,63,94,0.6)", fontWeight: 600, letterSpacing: "0.05em" }}>FINAL REVIEW</div>
          )}
        </div>
      </div>
    </div>
  );
}
