import { useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconCalendar } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import styles from './Calendar.module.css';

interface DateSelectorProps {
    value: string; // YYYY-MM-DD
    onChange: (value: string) => void;
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

const toDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function DateSelector({ value, onChange, firstDayOfWeek = 1 }: DateSelectorProps) {
    const selectedDate = useMemo(() => {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return new Date();
        return parsed;
    }, [value]);

    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

    const days = useMemo(() => {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const first = new Date(year, month, 1);
        const pad = (first.getDay() - firstDayOfWeek + 7) % 7;
        const count = new Date(year, month + 1, 0).getDate();
        const items: { date: Date; current: boolean }[] = [];

        const prevCount = new Date(year, month, 0).getDate();
        for (let i = pad - 1; i >= 0; i--) {
            items.push({ date: new Date(year, month - 1, prevCount - i), current: false });
        }

        for (let day = 1; day <= count; day++) {
            items.push({ date: new Date(year, month, day), current: true });
        }

        while (items.length < 42) {
            const day = items.length - (pad + count) + 1;
            items.push({ date: new Date(year, month + 1, day), current: false });
        }

        return items;
    }, [cursor, firstDayOfWeek]);

    const labels = useMemo(() => {
        const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        return [...dayLabels.slice(firstDayOfWeek), ...dayLabels.slice(0, firstDayOfWeek)];
    }, [firstDayOfWeek]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={styles.comboTrigger}>
                    <span>{selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <IconCalendar size={14} />
                </button>
            </PopoverTrigger>
            <PopoverContent className={styles.dateSelectorContent}>
                <div className={styles.dateSelectorHeader}>
                    <button type="button" className={styles.dateSelectorNav} onClick={() => setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                        <IconChevronLeft size={14} />
                    </button>
                    <strong>{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
                    <button type="button" className={styles.dateSelectorNav} onClick={() => setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
                        <IconChevronRight size={14} />
                    </button>
                </div>
                <div className={styles.dateSelectorGrid}>
                    {labels.map((label) => <div key={label} className={styles.dateSelectorLabel}>{label}</div>)}
                    {days.map((item) => {
                        const out = toDateInput(item.date);
                        const selected = out === value;
                        return (
                            <button
                                key={`${out}-${item.current ? 'c' : 'o'}`}
                                type="button"
                                className={`${styles.dateSelectorDay} ${!item.current ? styles.dateSelectorOther : ''} ${selected ? styles.dateSelectorSelected : ''}`}
                                onClick={() => {
                                    onChange(out);
                                    setOpen(false);
                                }}
                            >
                                {item.date.getDate()}
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
