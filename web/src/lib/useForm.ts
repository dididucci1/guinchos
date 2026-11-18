import { useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "./api";

/**
 * Estado de formulário + envio para a API.
 * `field("nome")` devolve { value, onChange } para ligar direto em <Input>/<Select>.
 */
export function useForm<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value }));

  const field = (key: keyof T) => ({
    value: values[key] ?? "",
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(key, e.target.value as T[keyof T]),
  });

  /** Envia e chama onDone; erros aparecem em `error`. */
  const submit = (path: string, method: string, onDone: (res: any) => void, body: unknown = values) => async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      onDone(await api(path, { method, body }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return { values, setValues, set, field, saving, error, setError, submit };
}
