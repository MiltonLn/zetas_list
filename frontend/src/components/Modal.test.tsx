import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        <p>Contenido</p>
      </Modal>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renderiza hijos cuando open=true', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Contenido visible</p>
      </Modal>,
    );
    expect(screen.getByText('Contenido visible')).toBeInTheDocument();
  });

  it('muestra el título cuando se provee', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Mi Modal">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText('Mi Modal')).toBeInTheDocument();
  });

  it('llama onClose al hacer click en el backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    const backdrop = screen.getByText('Body').closest('div')!.parentElement!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no cierra al hacer click dentro del contenido', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );

    await user.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('llama onClose al hacer click en el botón ✕', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );

    await user.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
