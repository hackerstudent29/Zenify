import React from "react";

export function ZenifyText({ text, className }: { text: string; className?: string }) {
 if (!text) return null;
 
 // Case-insensitive split for "zenify"
 const parts = text.split(/(zenify)/i);
 
 return (
 <span className={className}>
 {parts.map((part, i) => 
 part.toLowerCase() === 'zenify' ? (
 <span key={i} className="font-zenify tracking-wide">zenify</span>
 ) : (
 part
 )
 )}
 </span>
 );
}
