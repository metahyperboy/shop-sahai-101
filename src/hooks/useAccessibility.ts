import { useEffect, useRef } from 'react';

/**
 * Custom hook for managing focus and keyboard navigation
 * @param options - Configuration options for the hook
 * @param options.trapFocus - Whether to trap focus within the component
 * @param options.autoFocus - Whether to focus the first focusable element on mount
 * @param options.returnFocus - Whether to return focus to the previously focused element on unmount
 */
export function useAccessibility({
  trapFocus = false,
  autoFocus = true,
  returnFocus = true,
} = {}) {
  const containerRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<Element | null>(null);

  // Focus management
  useEffect(() => {
    if (autoFocus && containerRef.current) {
      // Save the currently focused element
      previousFocus.current = document.activeElement;
      
      // Find the first focusable element in the container
      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        containerRef.current.focus();
      }
    }

    // Return focus to the previously focused element
    return () => {
      if (returnFocus && previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, [autoFocus, returnFocus]);

  // Keyboard navigation
  useEffect(() => {
    if (!trapFocus || !containerRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusableElements = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) || []
        ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [trapFocus]);

  // Add ARIA attributes to the container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    // Add role and aria-modal if not already present
    if (!container.hasAttribute('role')) {
      container.setAttribute('role', 'dialog');
    }
    
    if (!container.hasAttribute('aria-modal')) {
      container.setAttribute('aria-modal', 'true');
    }
    
    // Add aria-label or aria-labelledby if neither is present
    if (!container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby')) {
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading && heading.id) {
        container.setAttribute('aria-labelledby', heading.id);
      } else {
        container.setAttribute('aria-label', 'Dialog');
      }
    }
  }, []);

  return { containerRef };
}

/**
 * Hook to handle focus management for modals and dialogs
 */
export function useModalFocus(containerRef: React.RefObject<HTMLElement>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;

    const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    firstElement.focus();

    // Handle focus trap
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(focusableElements).filter(
          el => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, containerRef]);
}
