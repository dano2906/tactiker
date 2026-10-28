/** Icono del sprite SVG de `index.html` (trazo de 24 px, color del texto). */
function Icon({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  )
}

export default Icon
