import React from 'react';
import { Icon } from '../Icon';

export function Notice({ type = 'info', children }) {
  return <div className={'service-notice ' + type} role={type === 'error' ? 'alert' : 'status'}>
    {type === 'busy' ? <span className="spinner" aria-hidden="true" /> : <Icon name={type === 'success' ? 'check' : type === 'error' ? 'close' : 'search'} size={17} />}
    <p>{children}</p>
  </div>;
}
