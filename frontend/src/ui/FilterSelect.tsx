import * as Select from "@radix-ui/react-select";

type Option = { value: string; label: string };
type Group = { label: string; options: Option[] };

export function FilterSelect({
  label,
  category,
  value,
  onChange,
  all,
  options = [],
  groups = [],
}: {
  label: string;
  category: string;
  value: string;
  onChange: (value: string) => void;
  all: string;
  options?: Option[];
  groups?: Group[];
}) {
  const encode = (value: string) => "value:" + value;
  const option = ({ value, label }: Option) => (
    <Select.Item className="filter-option" value={encode(value)} key={value}>
      <Select.ItemText>{label}</Select.ItemText>
      <Select.ItemIndicator className="filter-check" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
          <path
            d="m3 8 3 3 7-7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Select.ItemIndicator>
    </Select.Item>
  );

  return (
    <Select.Root
      value={encode(value)}
      onValueChange={(next) => onChange(next.slice("value:".length))}
    >
      <Select.Trigger
        className="filter-trigger"
        aria-label={label}
        data-filtered={value ? "" : undefined}
      >
        <span className="filter-trigger-text">
          <span className="filter-category" aria-hidden="true">
            {category}
          </span>
          <Select.Value />
        </span>
        <Select.Icon className="filter-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
            <path
              d="m4 6 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="filter-menu"
          position="popper"
          align="start"
          sideOffset={7}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="filter-scroll" aria-hidden="true">
            ⌃
          </Select.ScrollUpButton>
          <Select.Viewport className="filter-viewport">
            {option({ value: "", label: all })}
            {options.map(option)}
            {groups.map((group) => (
              <Select.Group key={group.label}>
                <Select.Label className="filter-group">
                  {group.label}
                </Select.Label>
                {group.options.map(option)}
              </Select.Group>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="filter-scroll" aria-hidden="true">
            ⌄
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
