import { useState, type FormEvent, type ReactNode } from 'react'
import t from '../today/today.module.css'
import c from './crew.module.css'
import { NAME_MAX, ROLE_MAX, checkNewMember, type NewMember, type NewMemberErrors } from './model.ts'

/** A native modal <dialog>: focus stays inside, Escape closes it, the page behind is inert. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={(d) => {
        if (d && !d.open) d.showModal()
      }}
      className={`${t.theme} ${c.dialog}`}
      aria-labelledby="crew-dialog-title"
      onClose={onClose}
    >
      <h2 id="crew-dialog-title" className={c.dialogTitle}>
        {title}
      </h2>
      {children}
    </dialog>
  )
}

interface AddProps {
  currentNames: string[]
  onAdd: (m: NewMember) => Promise<unknown>
  onClose: () => void
}

/** "Add crew member": name required (max 40), no exact duplicate, free-text role (max 30). */
export function AddMemberDialog({ currentNames, onAdd, onClose }: AddProps) {
  const [form, setForm] = useState<NewMember>({ name: '', role: '', sex: '' })
  const [errors, setErrors] = useState<NewMemberErrors>({})
  const [failed, setFailed] = useState<string>()
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<NewMember>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch)))) // clear the edited field's message
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const found = checkNewMember(form, currentNames)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setFailed(undefined)
    try {
      await onAdd(form)
      onClose()
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not add this person.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add crew member" onClose={onClose}>
      <form className={c.form} onSubmit={submit} noValidate>
        <label className={c.field}>
          <span className={c.fieldLabel}>
            Name <span className={t.muted}>{form.name.trim().length}/{NAME_MAX}</span>
          </span>
          <input
            autoFocus
            value={form.name}
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'crew-name-error' : undefined}
            onChange={(e) => set({ name: e.target.value })}
          />
          {errors.name && (
            <span id="crew-name-error" className={c.error}>
              {errors.name}
            </span>
          )}
        </label>

        <label className={c.field}>
          <span className={c.fieldLabel}>
            Role <span className={t.muted}>optional · {form.role.trim().length}/{ROLE_MAX}</span>
          </span>
          <input
            value={form.role}
            maxLength={ROLE_MAX}
            placeholder="Commander, Flight engineer…"
            aria-invalid={!!errors.role}
            aria-describedby={errors.role ? 'crew-role-error' : undefined}
            onChange={(e) => set({ role: e.target.value })}
          />
          {errors.role && (
            <span id="crew-role-error" className={c.error}>
              {errors.role}
            </span>
          )}
        </label>

        <fieldset className={c.field} aria-describedby={errors.sex ? 'crew-sex-error' : undefined}>
          <legend className={c.fieldLabel}>Body drawing on Today</legend>
          <div className={c.choices}>
            {(
              [
                ['F', 'Female'],
                ['M', 'Male'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={c.choice}>
                <input type="radio" name="sex" value={value} checked={form.sex === value} onChange={() => set({ sex: value })} />
                {label}
              </label>
            ))}
          </div>
          {errors.sex && (
            <span id="crew-sex-error" className={c.error}>
              {errors.sex}
            </span>
          )}
        </fieldset>

        {failed && (
          <p className={c.error} role="alert">
            {failed}
          </p>
        )}

        <div className={c.dialogActions}>
          <button type="button" className={t.ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={t.primaryBtn} disabled={saving}>
            {saving ? 'Adding…' : 'Add to crew'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface RemoveProps {
  name: string
  onRemove: () => Promise<unknown>
  onClose: () => void
}

/** Remove only sets removed_at: the person leaves the crew list, their data stays. */
export function RemoveMemberDialog({ name, onRemove, onClose }: RemoveProps) {
  const [failed, setFailed] = useState<string>()
  const [saving, setSaving] = useState(false)
  const remove = async () => {
    setSaving(true)
    try {
      await onRemove()
      onClose()
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not remove this person.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Remove ${name}?`} onClose={onClose}>
      <p className={c.dialogText}>
        {name} will no longer appear on the Crew board or in the avatar row. Their check-ins, alerts and history are kept, not
        deleted.
      </p>
      {failed && (
        <p className={c.error} role="alert">
          {failed}
        </p>
      )}
      <div className={c.dialogActions}>
        <button type="button" className={t.ghostBtn} onClick={onClose} autoFocus>
          Cancel
        </button>
        <button type="button" className={c.dangerBtn} onClick={remove} disabled={saving}>
          {saving ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </Modal>
  )
}
