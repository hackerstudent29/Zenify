import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

export default function Link({ href, children, className, ...props }: any) {
 // Support external links natively
 if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:'))) {
 return (
 <a href={href} className={className} {...props}>
 {children}
 </a>
 );
 }

 return (
 <RouterLink to={href || '#'} className={className} {...props}>
 {children}
 </RouterLink>
 );
}
