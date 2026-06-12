import { useRef, useState, useEffect, useCallback, ReactNode } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import './AnimatedList.css';

interface AnimatedItemProps {
 children: ReactNode;
 delay?: number;
 index: number;
 onMouseEnter?: () => void;
 onClick?: () => void;
 variant?: 'spring' | 'fade';
 once?: boolean;
}

const AnimatedItem = ({ children, delay = 0, index, onMouseEnter, onClick, variant = 'fade', once = true }: AnimatedItemProps) => {
 const ref = useRef(null);
 const inView = useInView(ref, { amount: 0.1, once: once });

 const springTransition: any = {
 type: "spring",
 stiffness: 260,
 damping: 25,
 delay: Math.min(index * 0.04, 0.2)
 };

 const fadeTransition: any = {
 duration: 0.25,
 ease: "easeOut",
 delay: Math.min(index * 0.03, 0.15)
 };

 const variants = {
 spring: {
 initial: { scale: 0.8, opacity: 0, y: 15 },
 animate: inView ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.8, opacity: 0, y: 15 },
 transition: springTransition
 },
 fade: {
 initial: { opacity: 0 },
 animate: inView ? { opacity: 1 } : { opacity: 0 },
 transition: {
 duration: 0.15,
 ease: "linear",
 delay: Math.min(index * 0.02, 0.1)
 }
 }
 };

 const currentVariant = variants[variant] || variants.fade;

 return (
 <div
 ref={ref}
 data-index={index}
 onClick={onClick}
 className="animated-item-wrapper"
 style={{
 opacity: inView ? 1 : 0,
 cursor: 'pointer',
 transition: 'opacity 0.2s ease-out'
 }}
 >
 {children}
 </div>
 );
};

interface AnimatedListProps {
 items: any[];
 renderItem: (item: any, index: number, isSelected: boolean) => ReactNode;
 onItemSelect?: (item: any, index: number) => void;
 showGradients?: boolean;
 enableArrowNavigation?: boolean;
 className?: string;
 itemClassName?: string;
 displayScrollbar?: boolean;
 initialSelectedIndex?: number;
 animationVariant?: 'spring' | 'fade';
 triggerOnce?: boolean;
}

const AnimatedList = ({
 items = [],
 renderItem,
 onItemSelect,
 showGradients = true,
 enableArrowNavigation = true,
 className = '',
 itemClassName = '',
 displayScrollbar = true,
 initialSelectedIndex = -1,
 animationVariant = 'fade',
 triggerOnce = true
}: AnimatedListProps) => {
 const listRef = useRef<HTMLDivElement>(null);
 const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
 const [keyboardNav, setKeyboardNav] = useState(false);
 const [topGradientOpacity, setTopGradientOpacity] = useState(0);
 const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

 const handleItemMouseEnter = useCallback((index: number) => {
 setSelectedIndex(index);
 }, []);

 const handleItemClick = useCallback(
 (item: any, index: number) => {
 setSelectedIndex(index);
 if (onItemSelect) {
 onItemSelect(item, index);
 }
 },
 [onItemSelect]
 );

 const handleScroll = useCallback((e: any) => {
 const { scrollTop, scrollHeight, clientHeight } = e.target;
 setTopGradientOpacity(Math.min(scrollTop / 50, 1));
 const bottomDistance = scrollHeight - (scrollTop + clientHeight);
 setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
 }, []);

 useEffect(() => {
 if (!enableArrowNavigation || !items.length) return;
 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
 e.preventDefault();
 setKeyboardNav(true);
 setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
 } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
 e.preventDefault();
 setKeyboardNav(true);
 setSelectedIndex(prev => Math.max(prev - 1, 0));
 } else if (e.key === 'Enter') {
 if (selectedIndex >= 0 && selectedIndex < items.length) {
 e.preventDefault();
 if (onItemSelect) {
 onItemSelect(items[selectedIndex], selectedIndex);
 }
 }
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => window.removeEventListener('keydown', handleKeyDown);
 }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

 useEffect(() => {
 if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
 const container = listRef.current;
 const selectedItem = container.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
 if (selectedItem) {
 const extraMargin = 50;
 const containerScrollTop = container.scrollTop;
 const containerHeight = container.clientHeight;
 const itemTop = selectedItem.offsetTop;
 const itemBottom = itemTop + selectedItem.offsetHeight;

 if (itemTop < containerScrollTop + extraMargin) {
 container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' });
 } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
 container.scrollTo({
 top: itemBottom - containerHeight + extraMargin,
 behavior: 'smooth'
 });
 }
 }
 setKeyboardNav(false);
 }, [selectedIndex, keyboardNav]);

 return (
 <div className={`animated-list-container ${className}`}>
 <div
 ref={listRef}
 className={`animated-list-scroll ${!displayScrollbar ? 'no-scrollbar' : 'custom-scrollbar'}`}
 onScroll={handleScroll}
 >
 {items.map((item, index) => (
 <AnimatedItem
 key={item.id || index}
 index={index}
 onClick={() => handleItemClick(item, index)}
 >
 {renderItem(item, index, selectedIndex === index)}
 </AnimatedItem>
 ))}
 </div>
 {showGradients && (
 <>
 <div className="list-top-gradient" style={{ opacity: topGradientOpacity }}></div>
 <div className="list-bottom-gradient" style={{ opacity: bottomGradientOpacity }}></div>
 </>
 )}
 </div>
 );
};

export default AnimatedList;
