# Frontend UI Components

Use the shared primitives in `frontend/src/components/common/ui` for generic app controls. They are also exported from `frontend/src/components/common/index.ts`.

## Imports

```tsx
import {
  Button,
  FormField,
  IconButton,
  Input,
  PickerTrigger,
  Select,
  Textarea,
} from "../common";
```

Adjust the relative import depth for nested components, for example `../../common` or `../../../common`.

## Button

```tsx
<Button variant="primary">Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Preview</Button>
<Button variant="danger">Delete</Button>
```

Props:

- `variant`: `primary`, `secondary`, `ghost`, `danger`
- `size`: `sm`, `md`, `lg`
- `loading`: disables the button and shows the shared spinner
- `leftIcon`, `rightIcon`: pass lucide icons or other small inline elements

Use `IconButton` for icon-only actions and always provide an accessible label:

```tsx
<IconButton aria-label="Delete" icon={<Trash2 size={16} />} variant="ghost" />
```

## Fields

Use `FormField` for labels, required markers, hints, and errors:

```tsx
<FormField label="Name" required error={nameError}>
  <Input value={name} onChange={(event) => setName(event.target.value)} />
</FormField>
```

Use `Input` for single-line text and numbers:

```tsx
<Input placeholder="Search" leadingIcon={<Search size={16} />} />
```

Use `Input`'s `trailingSlot` for small field-owned actions such as password
visibility:

```tsx
<Input
  type={showSecret ? "text" : "password"}
  trailingSlot={
    <IconButton
      aria-label="Toggle visibility"
      icon={showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
      size="sm"
      onClick={() => setShowSecret((shown) => !shown)}
    />
  }
/>
```

Use `Textarea` for multiline content:

```tsx
<Textarea rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
```

Use the shared `Checkbox` for generic assignment toggles:

```tsx
<Checkbox checked={enabled} onChange={() => setEnabled((current) => !current)} />
```

## Select

```tsx
<Select
  value={status}
  onChange={setStatus}
  options={[
    { value: "enabled", label: "Enabled" },
    { value: "disabled", label: "Disabled" },
  ]}
  placeholder="Choose status"
/>
```

`GlassSelect` remains available for compatibility, but new generic selects should use `Select`.

Use `PickerTrigger` for custom select-like pickers that need rich option rows,
icons, search, or asynchronous lists that do not fit the plain `Select` API.
Pair it with the shared `Input` for picker search fields:

```tsx
<PickerTrigger open={open} selected={Boolean(value)} onClick={() => setOpen(!open)}>
  <ModelIconImg model={value} size={18} />
  <span className="truncate">{label}</span>
</PickerTrigger>

<Input
  ref={searchRef}
  value={search}
  onChange={(event) => setSearch(event.target.value)}
  leadingIcon={<Search size={14} />}
/>
```

## Panel Controls

Admin panels should not assemble filter selects and footer action rows by hand.
Use the panel-level helpers exported from `common`:

```tsx
import { PanelFilterSelect, PanelFooterActions } from "../../common";
```

Use `PanelFilterSelect` for header/search-row filters. It composes the shared
`Select` primitive with the standard panel trigger size, active state, and
dropdown styling:

```tsx
<PanelFilterSelect
  value={status}
  onChange={setStatus}
  options={[
    { value: "", label: "All statuses" },
    { value: "enabled", label: "Enabled" },
  ]}
/>
```

Use `PanelFooterActions` for modal and sidebar footer buttons:

```tsx
<PanelFooterActions align="between">
  <Button onClick={onCancel}>Cancel</Button>
  <span className="panel-footer-actions__spacer" />
  <Button variant="primary" onClick={onSave}>Save</Button>
</PanelFooterActions>
```

Header-level commands in admin shells should use `Button` or `IconButton`
directly through `PanelHeader.actions`; keep tab/navigation buttons local when
their selected-state styling is part of the panel layout.

## Migration Rules

New generic frontend controls should use these primitives instead of adding new ad hoc class combinations.

Existing `btn-primary`, `btn-secondary`, `btn-danger`, `btn-icon`, `glass-input`, and `glass-select-*` classes are compatibility styles. They now share the primitive visual system, but do not use them in new generic app code.

Auth, landing, persona, team builder, and chat composer surfaces may keep local visual variants when they are intentionally part of the experience. Shared admin panels, settings, MCP, model, skill, user, memory, feedback, approval, and channel screens should prefer the primitives and panel controls.

Panel-specific density classes such as `es-input`, `es-textarea`, or
`approval-input` may be layered onto primitives when they preserve an existing
admin layout. Avoid using legacy classes as the base control.
