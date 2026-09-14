/** Inline styles — dark theme, zero CSS deps */
export const s = {
  panel: {
    position: 'fixed' as const,
    top: '0',
    right: '0',
    width: '320px',
    height: '100vh',
    'background-color': '#1a1a2e',
    color: '#e0e0e0',
    'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    'font-size': '12px',
    'overflow-y': 'auto',
    'z-index': '99999',
    'box-shadow': '-2px 0 12px rgba(0,0,0,0.4)',
    'border-left': '1px solid #2a2a4a',
    display: 'flex',
    'flex-direction': 'column' as const,
  },

  header: {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'space-between',
    padding: '8px 12px',
    'background-color': '#16162a',
    'border-bottom': '1px solid #2a2a4a',
    'font-size': '13px',
    'font-weight': '600',
    'letter-spacing': '0.5px',
    'flex-shrink': '0',
  },

  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    'font-size': '16px',
    padding: '0 4px',
  },

  actionBar: {
    display: 'flex',
    gap: '6px',
    'flex-wrap': 'wrap' as const,
    padding: '8px 12px',
    'background-color': '#16162a',
    'border-bottom': '1px solid #2a2a4a',
    'flex-shrink': '0',
  },

  actionBtn: {
    flex: '1',
    background: '#283a6b',
    border: '1px solid #3a5099',
    'border-radius': '4px',
    color: '#dce6ff',
    padding: '6px 10px',
    'font-size': '11px',
    'font-weight': '600',
    cursor: 'pointer',
    'font-family': 'inherit',
    'white-space': 'nowrap' as const,
  },

  searchWrap: {
    padding: '8px 12px',
    'flex-shrink': '0',
  },

  search: {
    width: '100%',
    padding: '6px 10px',
    background: '#12122a',
    border: '1px solid #2a2a4a',
    'border-radius': '4px',
    color: '#e0e0e0',
    'font-size': '11px',
    'font-family': 'inherit',
    'box-sizing': 'border-box' as const,
    outline: 'none',
  },

  tabs: {
    display: 'flex',
    'border-bottom': '1px solid #2a2a4a',
    'flex-shrink': '0',
  },

  tab: (active: boolean) => ({
    flex: '1',
    padding: '6px 0',
    background: 'none',
    border: 'none',
    'border-bottom': active ? '2px solid #7c9df0' : '2px solid transparent',
    color: active ? '#7c9df0' : '#888',
    cursor: 'pointer',
    'font-size': '11px',
    'font-family': 'inherit',
    'text-align': 'center' as const,
  }),

  content: {
    flex: '1',
    'overflow-y': 'auto',
  },

  section: {
    'border-bottom': '1px solid #222244',
  },

  sectionHeader: {
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    'user-select': 'none' as const,
    'font-size': '10px',
    'text-transform': 'uppercase' as const,
    'letter-spacing': '1px',
    color: '#7c9df0',
  },

  accordionHeader: {
    display: 'flex',
    'align-items': 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    'user-select': 'none' as const,
    'font-size': '11px',
    'font-weight': '600',
    'text-transform': 'uppercase' as const,
    'letter-spacing': '1px',
    color: '#7c9df0',
    'background-color': '#16162a',
    'border-bottom': '1px solid #2a2a4a',
  },

  chevron: (open: boolean) => ({
    display: 'inline-block',
    'font-size': '8px',
    transition: 'transform 0.15s',
    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
  }),

  chevronSmall: (open: boolean) => ({
    display: 'inline-block',
    'font-size': '7px',
    color: '#666',
    transition: 'transform 0.15s',
    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
  }),

  typeRow: {
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '5px 12px 5px 20px',
    cursor: 'pointer',
    'user-select': 'none' as const,
  },

  entityAccordion: {
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '5px 12px 5px 16px',
    cursor: 'pointer',
    'border-bottom': '1px solid #1e1e3a',
  },

  entityRow: {
    display: 'flex',
    'align-items': 'center',
    gap: '6px',
    padding: '4px 12px 4px 20px',
    cursor: 'pointer',
  },

  entityRowHover: {
    'background-color': '#1e1e3a',
  },

  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    'border-radius': '50%',
    'background-color': color,
    'flex-shrink': '0',
  }),

  entityId: {
    color: '#666',
    'font-size': '10px',
    'min-width': '28px',
  },

  componentName: {
    color: '#c9a0dc',
    'font-size': '11px',
  },

  fieldRow: {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'space-between',
    padding: '3px 12px 3px 40px',
    gap: '8px',
  },

  fieldLabel: {
    color: '#999',
    'font-size': '11px',
    'flex-shrink': '0',
  },

  fieldValue: {
    color: '#e0e0e0',
    'font-size': '11px',
    'text-align': 'right' as const,
  },

  input: {
    background: '#12122a',
    border: '1px solid #333',
    'border-radius': '3px',
    color: '#e0e0e0',
    padding: '2px 6px',
    'font-size': '11px',
    'font-family': 'inherit',
    width: '80px',
    'text-align': 'right' as const,
    outline: 'none',
  },

  toggle: (on: boolean) => ({
    width: '28px',
    height: '14px',
    'border-radius': '7px',
    background: on ? '#4caf50' : '#333',
    cursor: 'pointer',
    position: 'relative' as const,
    border: 'none',
    padding: '0',
    'flex-shrink': '0',
  }),

  toggleKnob: (on: boolean) => ({
    width: '10px',
    height: '10px',
    'border-radius': '50%',
    background: '#e0e0e0',
    position: 'absolute' as const,
    top: '2px',
    left: on ? '16px' : '2px',
    transition: 'left 0.15s',
  }),

  systemRow: {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'space-between',
    padding: '4px 12px 4px 20px',
  },

  badge: {
    display: 'inline-block',
    padding: '1px 6px',
    'border-radius': '8px',
    'font-size': '10px',
    'background-color': '#2a2a4a',
    color: '#999',
    'margin-left': '6px',
  },

  footer: {
    padding: '8px 12px',
    'border-top': '1px solid #2a2a4a',
    display: 'flex',
    'justify-content': 'space-between',
    'align-items': 'center',
    'font-size': '10px',
    color: '#666',
    'flex-shrink': '0',
  },

  footerBtn: {
    background: 'none',
    border: '1px solid #333',
    'border-radius': '3px',
    color: '#999',
    padding: '2px 8px',
    'font-size': '10px',
    cursor: 'pointer',
    'font-family': 'inherit',
  },

  backBtn: {
    background: 'none',
    border: 'none',
    color: '#7c9df0',
    cursor: 'pointer',
    padding: '6px 12px',
    'font-size': '11px',
    'font-family': 'inherit',
    'text-align': 'left' as const,
    width: '100%',
    'border-bottom': '1px solid #222244',
  },

  destroyBtn: {
    background: 'none',
    border: '1px solid #e57373',
    'border-radius': '3px',
    color: '#e57373',
    padding: '4px 12px',
    'font-size': '11px',
    cursor: 'pointer',
    'font-family': 'inherit',
    margin: '12px',
  },

  empty: {
    padding: '20px 12px',
    color: '#666',
    'text-align': 'center' as const,
    'font-size': '11px',
  },
} as const;
