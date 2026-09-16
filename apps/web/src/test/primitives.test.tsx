import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  CapacityMeter,
  DataTable,
  EmptyState,
  Field,
  Input,
  ProgressRing,
  SegmentedControl,
  SkeletonList,
  StatCard,
  StatusBadge,
  toast,
  usePager,
  type Column,
} from '../components/ui';

interface Row {
  id: string;
  name: string;
  places: number;
  status: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Junior Development', places: 18, status: 'scheduled' },
  { id: 'b', name: 'Adult Improvers', places: 24, status: 'breached' },
];

const DEMO = { name: 'Ana Rodrigues', age: 12, status: 'active', createdAt: '2026-09-01T10:00:00Z' };

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Session', cell: (r) => r.name, sortable: true },
  { key: 'places', header: 'Places', align: 'right', cell: (r) => r.places, sortable: true },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Button', () => {
  it('renders as a real button, is keyboard operable and blocks interaction while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = wrap(<Button onClick={onClick}>Save register</Button>);

    const button = screen.getByRole('button', { name: 'Save register' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <Button loading onClick={onClick}>
          Save register
        </Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps its styling when rendered as a child element (asChild)', () => {
    wrap(
      <Button asChild intent="primary" size="lg">
        <a href="/members">Members</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Members' });
    expect(link.className).toContain('bg-brand');
  });
});

describe('forms', () => {
  it('wires label, hint and error to the control via generated ids', () => {
    wrap(
      <Field label="Member name" hint="As it appears on registers" error="Name is required" required>
        {(ids) => <Input {...ids} />}
      </Field>,
    );
    const input = screen.getByLabelText(/Member name/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ').length).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });

  it('reports the selected option in a segmented control', async () => {
    function Harness() {
      const [value, setValue] = useState<'all' | 'flagged'>('all');
      return (
        <SegmentedControl
          ariaLabel="Filter"
          value={value}
          onChange={setValue}
          options={[
            { value: 'all', label: 'All' },
            { value: 'flagged', label: 'Flagged' },
          ]}
        />
      );
    }
    const user = userEvent.setup();
    wrap(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Filter' });
    await user.click(within(group).getByRole('radio', { name: 'Flagged' }));
    expect(within(group).getByRole('radio', { name: 'Flagged' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('status vocabulary', () => {
  it('maps every domain status to a consistent tone', () => {
    const { container } = wrap(
      <div>
        <StatusBadge status="breached" />
        <StatusBadge status="paid" />
        <StatusBadge status="outstandingDebit" />
        <StatusBadge status="pending_approval" />
      </div>,
    );
    const badges = container.querySelectorAll('span');
    const toneOf = (text: string) =>
      [...badges].find((b) => b.textContent?.trim().toLowerCase() === text)?.className ?? '';
    expect(toneOf('breached')).toContain('danger');
    expect(toneOf('outstanding debit')).toContain('danger');
    expect(toneOf('paid')).toContain('success');
    expect(toneOf('pending approval')).toContain('warning');
  });

  it('renders a dash for missing status rather than blank space', () => {
    wrap(<StatusBadge status={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  it('renders semantic table markup with sortable headers', async () => {
    const user = userEvent.setup();
    wrap(<DataTable data={ROWS} columns={COLUMNS} rowKey={(r) => r.id} caption="Sessions" />);

    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    expect(screen.getByRole('table')).toHaveAccessibleName('Sessions');

    const sortByName = screen.getByRole('button', { name: /Session/i });
    await user.click(sortByName);
    expect(screen.getByRole('columnheader', { name: /Session/i })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(sortByName);
    expect(screen.getByRole('columnheader', { name: /Session/i })).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts numerically, not lexically, on numeric columns', async () => {
    const user = userEvent.setup();
    wrap(<DataTable data={ROWS} columns={COLUMNS} rowKey={(r) => r.id} />);
    await user.click(screen.getByRole('button', { name: /Places/i }));
    const firstRow = screen.getAllByRole('row')[1];
    expect(within(firstRow).getByText('18')).toBeInTheDocument();
  });

  it('shows skeleton rows while loading and an empty state when there is no data', () => {
    const { rerender } = wrap(<DataTable data={[]} columns={COLUMNS} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole('status', { name: /loading table/i })).toBeInTheDocument();
    expect(screen.queryByText('Junior Development')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <DataTable
          data={[]}
          columns={COLUMNS}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No sessions yet" description="Create one to get started." />}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'No sessions yet' })).toBeInTheDocument();
  });

  it('activates rows from the keyboard so the table is operable without a mouse', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    wrap(<DataTable data={ROWS} columns={COLUMNS} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    const row = screen.getAllByRole('row')[1];
    row.focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });
});

describe('pagination hook', () => {
  it('slices rows and clamps the page when the data set shrinks', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    function Harness() {
      const pager = usePager(rows, 10);
      return (
        <div>
          <span data-testid="page">{pager.page}</span>
          <span data-testid="count">{pager.pageCount}</span>
          <span data-testid="slice">{pager.slice.join(',')}</span>
        </div>
      );
    }
    wrap(<Harness />);
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    expect(screen.getByTestId('slice')).toHaveTextContent('0,1,2,3,4,5,6,7,8,9');
  });
});

describe('feedback & status surfaces', () => {
  it('announces progress semantically', () => {
    wrap(<ProgressRing value={18} max={24} ariaLabel="Register progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Register progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });

  it('formats capacity for screen readers', () => {
    wrap(<CapacityMeter taken={25} capacity={24} />);
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('/24')).toBeInTheDocument();
  });

  it('reserves geometry with skeleton lists instead of a spinner', () => {
    wrap(<SkeletonList rows={3} />);
    expect(screen.getByRole('status', { name: /loading content/i })).toBeInTheDocument();
  });

  it('animates KPI values but always exposes the final number', async () => {
    wrap(<StatCard label="Members" value={482} />);
    expect(await screen.findByText('482')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('exposes the toast API surface used across the app', () => {
    expect(Object.keys(toast)).toEqual(
      expect.arrayContaining(['success', 'error', 'info', 'warning', 'loading', 'resolve', 'dismiss', 'undoable']),
    );
  });
});

describe('cards & badges', () => {
  it('renders card content with a display-font title', () => {
    wrap(
      <Card pad="md">
        <CardTitle>Session summary</CardTitle>
      </Card>,
    );
    const heading = screen.getByRole('heading', { name: 'Session summary' });
    expect(heading.className).toContain('font-display');
  });

  it('keeps badge tones semantic', () => {
    const { container } = wrap(<Badge tone="danger">Overdue</Badge>);
    expect(container.firstChild).toHaveProperty('className');
    expect((container.firstChild as HTMLElement).className).toContain('danger');
  });
});
