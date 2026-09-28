/**
 * Rótulo + controle + erro — o invólucro de um campo de formulário.
 *
 * Nasceu privado dentro de `CompanyFormFields.tsx` e saiu de lá quando o
 * formulário de categoria passou a precisar do mesmo arranjo. Não tem estado
 * nem sabe o que é um campo de empresa: recebe o `htmlFor` pronto, porque quem
 * gera os ids é o formulário (com `useId()`, para dois sheets montados ao mesmo
 * tempo não colidirem).
 */

export function Field({
  label,
  htmlFor,
  error,
  children,
  required,
}: {
  label: string;
  /** Id do controle. Sem ele o `<label>` não aponta para lugar nenhum. */
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-semibold text-primary"
      >
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
