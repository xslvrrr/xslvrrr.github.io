import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/Tooltip.module.css';

interface TooltipProps {
  children: ReactNode;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip = ({ children, text, position = 'right' }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      let top = 0;
      let left = 0;
      
      switch (position) {
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + 12;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - 12;
          break;
        case 'top':
          top = rect.top - 8;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + 8;
          left = rect.left + rect.width / 2;
          break;
      }
      
      setCoords({ top, left });
    }
  }, [isVisible, position]);

  const tooltipContent = isVisible ? (
    <div 
      className={`${styles.tooltip} ${styles[position]}`}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
    >
      {text}
    </div>
  ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>
      {typeof window !== 'undefined' && tooltipContent && createPortal(
        tooltipContent,
        document.body
      )}
    </>
  );
};
