/** Small DOM builders the panel and the part editor share. */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined)
    node.className = className;
  if (text !== undefined)
    node.textContent = text;
  return node;
}

/**
 * A labelled row: caption, control, optional readout. A real `<label for>` keeps
 * the control's accessible name to its caption, and `aria-describedby` keeps the
 * readout reachable without polluting that name.
 *
 * `idPrefix` exists because a caption is not unique across the document — the
 * bench and the machine controls would otherwise both mint `slot-speed`, and the
 * first `<label for>` would capture both.
 */
export function slot(
  label: string,
  control: HTMLElement,
  readout?: HTMLElement,
  idPrefix = 'slot',
): HTMLElement {
  const wrapper = element('div', 'slot');
  const labelable = control instanceof HTMLInputElement || control instanceof HTMLSelectElement;

  if (labelable && label.length > 0) {
    const id = `${idPrefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    control.id = id;
    const caption = element('label', 'slot-label', label);
    caption.htmlFor = id;
    wrapper.append(caption);

    if (readout !== undefined) {
      const readoutId = `${id}-readout`;
      readout.id = readoutId;
      control.setAttribute('aria-describedby', readoutId);
    }
  }
  else {
    wrapper.append(element('span', 'slot-label', label));
  }

  wrapper.append(control);
  if (readout !== undefined)
    wrapper.append(readout);
  return wrapper;
}

export function configureRange(input: HTMLInputElement, min: number, max: number, step: number): void {
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
}
