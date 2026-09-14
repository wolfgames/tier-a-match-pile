import gsap from 'gsap';

export interface EasingOption {
  label: string;
  value: string;
}

export const EASING_OPTIONS: EasingOption[] = [
  { label: 'Linear', value: 'none' },
  { label: 'Power1 Out', value: 'power1.out' },
  { label: 'Power2 Out', value: 'power2.out' },
  { label: 'Power3 Out', value: 'power3.out' },
  { label: 'Power4 Out', value: 'power4.out' },
  { label: 'Back Out', value: 'back.out(1.7)' },
  { label: 'Back Out (subtle)', value: 'back.out(1)' },
  { label: 'Back Out (strong)', value: 'back.out(3)' },
  { label: 'Elastic Out', value: 'elastic.out(1, 0.3)' },
  { label: 'Elastic Out (soft)', value: 'elastic.out(1, 0.5)' },
  { label: 'Bounce Out', value: 'bounce.out' },
  { label: 'Expo Out', value: 'expo.out' },
  { label: 'Circ Out', value: 'circ.out' },
];

/**
 * Create a mini SVG easing curve for dropdown options.
 * Larger version with headroom for overshoot, border instead of background.
 */
function createMiniCurveSvg(easing: string, width = 100, height = 48): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.display = 'block';
  svg.style.flexShrink = '0';

  const padding = 6;
  const graphWidth = width - padding * 2;
  const overshootRatio = 0.25;
  const undershootRatio = 0.1;
  const graphHeight = height - padding * 2;
  const baselineY = padding + graphHeight * overshootRatio;
  const floorY = padding + graphHeight * (1 - undershootRatio);
  const usableHeight = floorY - baselineY;

  // Border only (no fill)
  const border = document.createElementNS(ns, 'rect');
  border.setAttribute('x', '1');
  border.setAttribute('y', '1');
  border.setAttribute('width', String(width - 2));
  border.setAttribute('height', String(height - 2));
  border.setAttribute('fill', 'none');
  border.setAttribute('stroke', 'rgba(255, 255, 255, 0.2)');
  border.setAttribute('stroke-width', '1');
  border.setAttribute('rx', '3');
  svg.appendChild(border);

  // Sample the easing function
  const easeFn = gsap.parseEase(easing) || ((t: number) => t);
  const samples = 40;
  const points: string[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const value = easeFn(t);
    const x = padding + t * graphWidth;
    const y = floorY - value * usableHeight;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  // Easing curve path
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', points.join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#4dabf7');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);

  return svg;
}

/**
 * Custom easing picker dropdown with mini curve previews.
 * Vanilla DOM component for Tweakpane integration.
 */
export class EasingPicker {
  readonly element: HTMLElement;
  private button: HTMLElement;
  private dropdown: HTMLElement;
  private isOpen = false;
  private currentValue: string;
  private onChange: (value: string) => void;
  private boundHandleClickOutside: (e: MouseEvent) => void;
  private boundHandleKeydown: (e: KeyboardEvent) => void;

  constructor(initialValue: string, onChange: (value: string) => void) {
    this.currentValue = initialValue;
    this.onChange = onChange;
    this.boundHandleClickOutside = this.handleClickOutside.bind(this);
    this.boundHandleKeydown = this.handleKeydown.bind(this);

    // Create container
    this.element = document.createElement('div');
    this.element.style.cssText = 'position: relative; width: 100%;';

    // Create button
    this.button = this.createButton();
    this.element.appendChild(this.button);

    // Create dropdown
    this.dropdown = this.createDropdown();
    this.element.appendChild(this.dropdown);

    // Button click handler
    this.button.addEventListener('click', () => this.toggle());
  }

  private createButton(): HTMLElement {
    const button = document.createElement('button');
    button.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      cursor: pointer;
      gap: 4px;
    `;

    this.updateButtonContent(button);
    return button;
  }

  private updateButtonContent(button: HTMLElement): void {
    button.innerHTML = '';

    // Top row: curve + chevron
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px;';

    // Mini curve (top)
    const curve = createMiniCurveSvg(this.currentValue);
    topRow.appendChild(curve);

    // Chevron (right of curve)
    const chevron = document.createElement('span');
    chevron.textContent = '▼';
    chevron.style.cssText = 'font-size: 8px; opacity: 0.6;';
    topRow.appendChild(chevron);

    button.appendChild(topRow);

    // Label (below curve)
    const label = document.createElement('span');
    label.style.cssText = 'text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    label.textContent = this.getCurrentLabel();
    button.appendChild(label);
  }

  private getCurrentLabel(): string {
    const option = EASING_OPTIONS.find((o) => o.value === this.currentValue);
    return option?.label || this.currentValue;
  }

  private createDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 10000;
      margin-top: 2px;
      background: #1e1e2e;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Create options
    for (const option of EASING_OPTIONS) {
      const row = this.createOption(option);
      dropdown.appendChild(row);
    }

    return dropdown;
  }

  private createOption(option: EasingOption): HTMLElement {
    const row = document.createElement('div');
    const isSelected = option.value === this.currentValue;

    row.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 6px 8px;
      cursor: pointer;
      gap: 4px;
      background: ${isSelected ? 'rgba(77, 171, 247, 0.2)' : 'transparent'};
    `;

    // Hover effects
    row.addEventListener('mouseenter', () => {
      if (option.value !== this.currentValue) {
        row.style.background = 'rgba(255, 255, 255, 0.1)';
      }
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = option.value === this.currentValue ? 'rgba(77, 171, 247, 0.2)' : 'transparent';
    });

    // Top row: curve + checkmark
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';

    // Mini curve (top left)
    const curve = createMiniCurveSvg(option.value);
    topRow.appendChild(curve);

    // Checkmark for selected (top right)
    const check = document.createElement('span');
    check.textContent = isSelected ? '✓' : '';
    check.style.cssText = 'font-size: 12px; color: #4dabf7;';
    topRow.appendChild(check);

    row.appendChild(topRow);

    // Label (below curve)
    const label = document.createElement('span');
    label.style.cssText = 'font-size: 11px; color: #fff; white-space: nowrap;';
    label.textContent = option.label;
    row.appendChild(label);

    // Click handler
    row.addEventListener('click', () => this.select(option.value));

    return row;
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.isOpen = true;
    this.dropdown.style.display = 'block';

    // Add listeners
    setTimeout(() => {
      document.addEventListener('click', this.boundHandleClickOutside);
      document.addEventListener('keydown', this.boundHandleKeydown);
    }, 0);
  }

  private close(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';

    // Remove listeners
    document.removeEventListener('click', this.boundHandleClickOutside);
    document.removeEventListener('keydown', this.boundHandleKeydown);
  }

  private select(value: string): void {
    this.currentValue = value;
    this.updateButtonContent(this.button);
    this.rebuildDropdown();
    this.close();
    this.onChange(value);
  }

  private rebuildDropdown(): void {
    this.dropdown.innerHTML = '';
    for (const option of EASING_OPTIONS) {
      const row = this.createOption(option);
      this.dropdown.appendChild(row);
    }
  }

  private handleClickOutside(e: MouseEvent): void {
    if (!this.element.contains(e.target as Node)) {
      this.close();
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    }
  }

  /** Update value programmatically */
  setValue(value: string): void {
    this.currentValue = value;
    this.updateButtonContent(this.button);
    this.rebuildDropdown();
  }

  /** Clean up event listeners */
  destroy(): void {
    document.removeEventListener('click', this.boundHandleClickOutside);
    document.removeEventListener('keydown', this.boundHandleKeydown);
  }
}
