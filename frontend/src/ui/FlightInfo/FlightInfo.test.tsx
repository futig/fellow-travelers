import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeTrip } from '../../test/fixtures';
import { FlightOption } from '../FlightOption/FlightOption';
import { FlightInfo } from './FlightInfo';

describe('FlightInfo', () => {
  it('по расписанию: номер, дата · багаж, времена, города', () => {
    render(<FlightInfo trip={makeTrip()} baggageCount={2} />);
    expect(screen.getByText('SU 1148')).toBeInTheDocument();
    expect(screen.getByText('22 августа · 2 чемодана')).toBeInTheDocument();
    expect(screen.getByText(/08:40/)).toBeInTheDocument();
    expect(screen.getByText(/12:25/)).toBeInTheDocument();
    expect(screen.getByText('Москва, SVO')).toBeInTheDocument();
    expect(screen.getByText('● По расписанию')).toBeInTheDocument();
    expect(screen.queryByText(/организатором/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('задержка: расчётное время и зачёркнутое плановое', () => {
    const trip = makeTrip({
      estimated_arrival: '2026-08-22T13:10:00+03:00',
      effective_arrival: '2026-08-22T13:10:00+03:00',
    });
    render(<FlightInfo trip={trip} showSource />);
    expect(screen.getByText('● Задержан')).toBeInTheDocument();
    expect(screen.getByText(/13:10/)).toHaveClass('late');
    expect(screen.getByText(/12:25/).closest('s')).not.toBeNull();
    expect(screen.getByText('Расписание внесено организатором')).toBeInTheDocument();
  });

  it('status=delayed без расчётного времени: «Задержан», без зачёркнутого времени', () => {
    render(<FlightInfo trip={makeTrip({ status: 'delayed' })} />);
    expect(screen.getByText('● Задержан')).toBeInTheDocument();
    expect(screen.getByText(/12:25/).closest('s')).toBeNull();
    expect(screen.getAllByText(/12:25/)).toHaveLength(1);
  });

  it('status=delayed, расчётное совпадает с плановым: без зачёркнутого времени', () => {
    const trip = makeTrip({ status: 'delayed', estimated_arrival: '2026-08-22T12:25:00+03:00' });
    render(<FlightInfo trip={trip} />);
    expect(screen.getByText('● Задержан')).toBeInTheDocument();
    expect(screen.getAllByText(/12:25/)).toHaveLength(1);
    expect(document.querySelector('s')).toBeNull();
  });

  it('раньше срока: «Прилетит раньше», новое время обычным цветом, плановое зачёркнуто', () => {
    const trip = makeTrip({
      estimated_arrival: '2026-08-22T12:05:00+03:00',
      effective_arrival: '2026-08-22T12:05:00+03:00',
    });
    render(<FlightInfo trip={trip} />);
    expect(screen.getByText('● Прилетит раньше')).toHaveClass('success');
    expect(screen.queryByText(/Задержан/)).not.toBeInTheDocument();
    expect(screen.getByText(/12:05/)).not.toHaveClass('late');
    expect(screen.getByText(/12:25/).closest('s')).not.toBeNull();
  });

  it('прилёт на следующие сутки — «+1», кнопка правки', async () => {
    const onEdit = vi.fn();
    const trip = makeTrip({
      scheduled_departure: '2026-08-22T22:40:00+03:00',
      scheduled_arrival: '2026-08-23T01:10:00+03:00',
      effective_arrival: '2026-08-23T01:10:00+03:00',
    });
    render(<FlightInfo trip={trip} onEdit={onEdit} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Изменить рейс' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe('FlightOption', () => {
  it('номер и маршрут', () => {
    render(<FlightOption trip={makeTrip()} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /SU 1148/ })).toBeInTheDocument();
    expect(screen.getByText('08:40 SVO → 12:25 GDZ')).toBeInTheDocument();
  });
});
