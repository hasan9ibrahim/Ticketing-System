import Select from 'react-select';

export const SearchableSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select...",
  isRequired = false,
  isDisabled = false,
  className = ""
}) => {
  const customStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: '#27272a',
      borderColor: state.isFocused ? '#10b981' : '#3f3f46',
      minHeight: '40px',
      boxShadow: state.isFocused ? '0 0 0 1px #10b981' : 'none',
      '&:hover': {
        borderColor: '#10b981'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: '#27272a',
      border: '1px solid #3f3f46',
      zIndex: 100
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? '#3f3f46' : '#27272a',
      color: '#ffffff',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: '#52525b'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: '#ffffff'
    }),
    input: (base) => ({
      ...base,
      color: '#ffffff'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#71717a'
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
