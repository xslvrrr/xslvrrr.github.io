import { useMemo, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import styles from './Calendar.module.css';

interface ComboboxOption {
    value: string;
    label: string;
}

interface ComboboxFieldProps {
    value: string;
    options: ComboboxOption[];
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function ComboboxField({
    value,
    options,
    onChange,
    placeholder = 'Select option',
}: ComboboxFieldProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((option) => option.label.toLowerCase().includes(q));
    }, [options, query]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={styles.comboTrigger}>
                    <span>{selected?.label || placeholder}</span>
                    <IconChevronDown size={14} />
                </button>
            </PopoverTrigger>
            <PopoverContent className={styles.comboContent}>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={styles.comboSearch}
                    placeholder="Search..."
                />
                <div className={styles.comboList}>
                    {filtered.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={styles.comboItem}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                        >
                            <span>{option.label}</span>
                            {option.value === value && <IconCheck size={14} />}
                        </button>
                    ))}
                    {filtered.length === 0 && <div className={styles.comboEmpty}>No results</div>}
                </div>
            </PopoverContent>
        </Popover>
    );
}
