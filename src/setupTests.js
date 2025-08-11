/**
 * Jest测试环境设置
 */
import '@testing-library/jest-dom';

// Mock UXP APIs
global.require = jest.fn((module) => {
  switch (module) {
    case 'uxp':
      return {
        entrypoints: {
          setup: jest.fn()
        }
      };
    case 'photoshop':
      return {
        app: {
          activeDocument: null
        }
      };
    case 'os':
      return {
        platform: () => 'darwin'
      };
    default:
      return {};
  }
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  readyState: 1,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}));

// Mock EventSource
global.EventSource = jest.fn().mockImplementation(() => ({
  readyState: 1,
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
}));

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeEach(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  Object.assign(console, originalConsole);
  jest.clearAllMocks();
});

// Mock timers
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// Mock Adobe Spectrum Web Components
const mockSpectrumComponent = (tagName) => {
  const element = document.createElement('div');
  element.tagName = tagName.toUpperCase();
  return element;
};

// Define custom elements for Adobe Spectrum components
const spectrumComponents = [
  'sp-textfield',
  'sp-picker',
  'sp-progress-circle',
  'sp-icon',
  'sp-divider',
  'sp-tabs',
  'sp-tab',
  'sp-tab-panel',
  'sp-checkbox',
  'sp-number-field',
  'sp-field-label',
  'sp-slider',
  'sp-label',
  'sp-asset',
  'sp-color-wheel',
];

spectrumComponents.forEach(tagName => {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
      }
      
      connectedCallback() {
        this.shadowRoot.innerHTML = `<slot></slot>`;
      }
      
      // 正确处理 disabled 属性
      get disabled() {
        return this.hasAttribute('disabled');
      }
      
      set disabled(value) {
        if (value) {
          this.setAttribute('disabled', '');
        } else {
          this.removeAttribute('disabled');
        }
      }
      
      // 正确处理其他常用属性
      get value() {
        return this.getAttribute('value') || '';
      }
      
      set value(val) {
        this.setAttribute('value', val);
      }
      
      get invalid() {
        return this.hasAttribute('invalid');
      }
      
      set invalid(value) {
        if (value) {
          this.setAttribute('invalid', '');
        } else {
          this.removeAttribute('invalid');
        }
      }
      
      get variant() {
        return this.getAttribute('variant');
      }
      
      set variant(value) {
        this.setAttribute('variant', value);
      }
      
      get size() {
        return this.getAttribute('size');
      }
      
      set size(value) {
        this.setAttribute('size', value);
      }
      
      get checked() {
        return this.hasAttribute('checked');
      }
      
      set checked(value) {
        if (value) {
          this.setAttribute('checked', '');
        } else {
          this.removeAttribute('checked');
        }
      }
      
      get required() {
        return this.hasAttribute('required');
      }
      
      set required(value) {
        if (value) {
          this.setAttribute('required', '');
        } else {
          this.removeAttribute('required');
        }
      }
    });
  }
});

// Suppress React warnings in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});