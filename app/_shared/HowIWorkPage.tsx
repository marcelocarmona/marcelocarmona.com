import { DisplayTitle, Eyebrow } from '@/components/ui/typography'
import type { Locale } from '@/types/content'

const copy = {
  en: {
    eyebrow: 'Working together',
    title: 'How I Work',
    introduction:
      'I’m a software engineer based in San Francisco and work on Pacific Time. I believe great engineering comes from focused work, clear communication, and sustainable habits. It does not require being online around the clock.',
    details: [
      { label: 'Working hours', value: 'Monday to Friday, 9 AM to 5 PM PT' },
      { label: 'Default rhythm', value: 'Written updates first, meetings when useful' },
    ],
    principlesLabel: 'Principles',
    principles: [
      {
        title: 'Remote first',
        body: 'I value flexibility, autonomy, and the chance to work with talented people regardless of location. I care about outcomes, not where someone works.',
      },
      {
        title: 'Async by default',
        body: 'I prefer thoughtful written communication, useful documentation, and fewer unnecessary meetings. I do not expect instant replies, and I do not assume other people do either.',
      },
      {
        title: 'Deep work',
        body: 'I protect uninterrupted time for building, solving difficult problems, and thinking through architecture. A clear decision made with care is usually worth more than a day full of status meetings.',
      },
      {
        title: 'Life outside work',
        body: 'Evenings and weekends are for friends, family, and everything else that makes life interesting. Unless there is a genuine emergency or an agreed on call responsibility, work can wait until the next business day.',
      },
    ],
    philosophyLabel: 'My philosophy',
    philosophy: [
      'Do great work.',
      'Communicate clearly.',
      'Respect people’s time.',
      'Build things that last.',
    ],
  },
  es: {
    eyebrow: 'Trabajar juntos',
    title: 'Cómo trabajo',
    introduction:
      'Soy ingeniero de software, vivo en San Francisco y trabajo en horario del Pacífico. Creo que la buena ingeniería nace del trabajo enfocado, la comunicación clara y los hábitos sostenibles. No requiere estar conectado a toda hora.',
    details: [
      { label: 'Horario laboral', value: 'Lunes a viernes, de 9 a 17 PT' },
      { label: 'Ritmo habitual', value: 'Primero por escrito, reuniones cuando aportan valor' },
    ],
    principlesLabel: 'Principios',
    principles: [
      {
        title: 'Trabajo remoto',
        body: 'Valoro la flexibilidad, la autonomía y la posibilidad de trabajar con gente talentosa sin importar dónde viva. Me importan los resultados, no el lugar desde donde trabaja cada persona.',
      },
      {
        title: 'Comunicación asíncrona',
        body: 'Prefiero la comunicación escrita y pensada, la documentación útil y menos reuniones innecesarias. No espero respuestas instantáneas ni doy por sentado que los demás las esperan.',
      },
      {
        title: 'Trabajo enfocado',
        body: 'Protejo bloques de tiempo sin interrupciones para construir, resolver problemas difíciles y pensar la arquitectura. Una decisión clara y meditada suele valer más que un día lleno de reuniones de estado.',
      },
      {
        title: 'Vida fuera del trabajo',
        body: 'Las tardes, las noches y los fines de semana son para los amigos, la familia y todo lo demás que hace interesante la vida. Salvo una emergencia real o una guardia acordada, el trabajo puede esperar hasta el siguiente día hábil.',
      },
    ],
    philosophyLabel: 'Mi filosofía',
    philosophy: [
      'Hacer un gran trabajo.',
      'Comunicar con claridad.',
      'Respetar el tiempo de los demás.',
      'Construir cosas que perduren.',
    ],
  },
} satisfies Record<Locale, object>

export default function HowIWorkPage({ locale }: { locale: Locale }) {
  const content = copy[locale]

  return (
    <article className="pb-4 pt-10 sm:pt-16">
      <header className="grid gap-8 border-b border-border pb-12 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end lg:gap-16">
        <div className="max-w-3xl">
          <Eyebrow>{content.eyebrow}</Eyebrow>
          <DisplayTitle
            as="h1"
            className="mt-4 text-5xl font-semibold leading-[0.95] text-foreground sm:text-6xl md:text-7xl"
          >
            {content.title}
          </DisplayTitle>
        </div>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground lg:text-base lg:leading-7">
          {content.introduction}
        </p>
      </header>

      <dl className="grid border-b border-border sm:grid-cols-2">
        {content.details.map((detail, index) => (
          <div
            key={detail.label}
            className={`py-6 ${index === 0 ? 'border-b border-border sm:border-b-0 sm:border-r sm:pr-8' : 'sm:pl-8'}`}
          >
            <dt className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {detail.label}
            </dt>
            <dd className="mt-2 text-base font-medium leading-6 text-foreground">{detail.value}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-8 py-14 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
        <Eyebrow as="h2" className="pt-1">
          {content.principlesLabel}
        </Eyebrow>
        <ol className="border-t border-border">
          {content.principles.map((principle, index) => (
            <li
              key={principle.title}
              className="grid gap-3 border-b border-border py-8 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6"
            >
              <span className="font-mono text-xs text-primary" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
                <h3 className="font-display text-xl font-semibold leading-6 text-foreground">
                  {principle.title}
                </h3>
                <p className="max-w-xl text-base leading-7 text-muted-foreground">
                  {principle.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-border py-12 sm:py-16">
        <Eyebrow as="h2">{content.philosophyLabel}</Eyebrow>
        <p className="mt-6 max-w-4xl font-display text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {content.philosophy.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </section>
    </article>
  )
}
