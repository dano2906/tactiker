/** Nombre y descripción de cada plantilla. Los constructores (`templates.ts`) se cargan solo al aplicar una. */
export interface TemplateMeta {
  id: string
  name: string
  description: string
}

export const TEMPLATE_META: TemplateMeta[] = [
  {
    id: 'corner',
    name: 'Córner a favor',
    description: 'El rojo saca un córner por la derecha, con desmarques al primer palo y remate.',
  },
  {
    id: 'throw-in',
    name: 'Saque de banda',
    description: 'El rojo saca de banda arriba; un compañero se ofrece, recibe y sigue la jugada.',
  },
  {
    id: 'buildup',
    name: 'Salida de balón',
    description: 'El portero rojo inicia la jugada ante la presión azul y sale jugando por los centrales y el medio.',
  },
  {
    id: 'counter',
    name: 'Contraataque 3 contra 2',
    description: 'Tres rojos salen al contragolpe contra dos defensas azules: conducción, pase y remate.',
  },
  {
    id: 'high-press',
    name: 'Presión alta',
    description: 'El rojo presiona la salida del portero azul: los delanteros cierran a los centrales y el bloque sube.',
  },
  {
    id: 'low-block',
    name: 'Bloque bajo',
    description: 'El rojo defiende cerca de su área y se desplaza en bloque hacia el lado donde está el balón.',
  },
  {
    id: 'free-kick',
    name: 'Falta con barrera',
    description: 'Falta directa del rojo desde la frontal, con barrera de cuatro azules y delanteros en el área.',
  },
  {
    id: 'penalty',
    name: 'Penalti',
    description: 'Lanzamiento desde el punto de penalti con el portero azul en la línea y el resto fuera del área.',
  },
  {
    id: 'overlap',
    name: 'Desdoblamiento por banda',
    description: 'El lateral rojo rebasa por fuera al extremo, recibe y centra al delantero.',
  },
]
