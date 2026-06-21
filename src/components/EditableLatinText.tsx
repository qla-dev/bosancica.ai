interface EditableLatinTextProps {
  value: string;
  onChange: (value: string) => void;
}

export default function EditableLatinText({ value, onChange }: EditableLatinTextProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
      spellCheck
      className="latin-editor"
      aria-label="Uredi latiničnu transliteraciju"
    />
  );
}
