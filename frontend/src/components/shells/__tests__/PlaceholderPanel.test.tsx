import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderPanel } from '../PlaceholderPanel';

describe('PlaceholderPanel', () => {
  it('renders its title as a heading so the page has a landmark', () => {
    render(<PlaceholderPanel title="Chat" note="Placeholder." />);

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByText('Placeholder.')).toBeInTheDocument();
  });
});
