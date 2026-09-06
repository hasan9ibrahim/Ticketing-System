import Select from 'react-select';
import { useTheme } from '@/contexts/ThemeContext';

const PALETTES = {
  dark: {
    surface: '#27272a',
    border: '#3f3f46',
    hover: '#3f3f46',
    active: '#52525b',
    text: '#ffffff',
    placeholder: '#71717a',
  },
  light: {
    surface: '#f3f4f6',
    border: '#e5e7eb',
    hover: '#e5e7eb',
    active: '#d1d5db',
    text: '#111827',
    placeholder: '#6b7280',
  },
};

export const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  isRequired = false,
  isDisabled = false,
  className = ""
}) => {
  const { theme } = useTheme();
  const colors = PALETTES[theme];
  const customStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: colors.surface,
      borderColor: state.isFocused ? '#10b981' : colors.border,
      minHeight: '40px',
      boxShadow: state.isFocused ? '0 0 0 1px #10b981' : 'none',
      '&:hover': {
        borderColor: '#10b981'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      zIndex: 100
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? colors.hover : colors.surface,
      color: colors.text,
      cursor: 'pointer',
      '&:active': {
        backgroundColor: colors.active
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: colors.text
    }),
    input: (base) => ({
      ...base,
      color: colors.text
    }),
    placeholder: (base) => ({
      ...base,
      color: colors.placeholder
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: '200px'
    })
  };

  // Convert value to the format react-select expects
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <Select
      options={options}
      value={selectedOption}
      onChange={(option) => onChange(option?.value)}
      placeholder={placeholder}
      isClearable={!isRequired}
      isSearchable={true}
      isDisabled={isDisabled}
      styles={customStyles}
      className={className}
    />
  );
};

export default SearchableSelect;
