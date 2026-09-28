import '@testing-library/jest-dom/vitest';

// Radix primitives (shadcn Select, etc.) touch a few DOM APIs jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
