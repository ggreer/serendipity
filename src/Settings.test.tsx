import React from 'react';
import { render, screen } from '@testing-library/react';
import { Settings } from './Settings';

test('renders learn react link', () => {
  render(<Settings />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
