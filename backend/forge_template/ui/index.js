import { createElement } from 'react';

export function Panel({ children, className = '', ...props }) {
  return createElement('section', { ...props, className: `dkf-panel ${className}`.trim() }, children);
}

export function Button({ children, className = '', type = 'button', ...props }) {
  return createElement('button', { ...props, type, className: `dkf-button ${className}`.trim() }, children);
}

export function Field({ label, id, ...props }) {
  return createElement('div', { className: 'dkf-field' },
    createElement('label', { htmlFor: id }, label),
    createElement('input', { ...props, id, className: 'dkf-input' }));
}
