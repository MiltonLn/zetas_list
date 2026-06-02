import { useState, type ReactNode } from 'react';

/* ──────────────────────────────────────────────────────────────────────────
   Página pública: guía completa de Zetas App.
   Explica de forma gráfica todo el funcionamiento: registro, comandos de
   WhatsApp, lista de espera + auto-promoción, invitados, la web y finanzas,
   más un ejemplo de un partido real. Ruta pública /guia (sin login).
   ────────────────────────────────────────────────────────────────────────── */

const WHATSAPP_GREEN = '#25d366';

type CmdColor = 'blue' | 'green' | 'purple' | 'cyan' | 'red';

const COLOR_MAP: Record<CmdColor, { ring: string; text: string; bg: string }> = {
  blue: { ring: '#3b5bdb', text: '#9db2ff', bg: 'rgba(59,91,219,0.12)' },
  green: { ring: '#2ecc71', text: '#7be8a8', bg: 'rgba(46,204,113,0.12)' },
  purple: { ring: '#9b59b6', text: '#d29be8', bg: 'rgba(155,89,182,0.14)' },
  cyan: { ring: '#22b8cf', text: '#8ce0ec', bg: 'rgba(34,184,207,0.12)' },
  red: { ring: '#e74c3c', text: '#f5a097', bg: 'rgba(231,76,60,0.12)' },
};

function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8 text-center">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#6e8efb] mb-2">{kicker}</div>
      <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">{title}</h2>
      {subtitle && <p className="mt-3 text-base sm:text-lg text-[#7c8db5] max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}

function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl border border-[#2a2f5a] bg-[#161829] ${className}`} style={style}>
      {children}
    </div>
  );
}

function StepCard({ n, icon, title, children }: { n: number; icon: string; title: string; children: ReactNode }) {
  return (
    <Card className="p-6 relative overflow-hidden">
      <div className="absolute -right-4 -top-6 text-[120px] font-black text-white/[0.03] leading-none select-none">{n}</div>
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-[#a7b0d0] leading-relaxed text-[15px]">{children}</p>
    </Card>
  );
}

function CommandCard({
  cmd,
  desc,
  synonyms,
  color,
  badge,
}: {
  cmd: string;
  desc: string;
  synonyms?: string;
  color: CmdColor;
  badge?: string;
}) {
  const c = COLOR_MAP[color];
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2"
      style={{ borderColor: `${c.ring}55`, background: c.bg }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <code className="font-mono text-[15px] font-bold" style={{ color: c.text }}>
          {cmd}
        </code>
        {badge && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ color: c.ring, border: `1px solid ${c.ring}66` }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-[#c5cce6] text-sm leading-relaxed">{desc}</p>
      {synonyms && <p className="text-[#7c8db5] text-xs">También: {synonyms}</p>}
    </div>
  );
}

type BubbleKind = 'user' | 'bot' | 'system';

function ChatBubble({ kind, name, children }: { kind: BubbleKind; name?: string; children: ReactNode }) {
  if (kind === 'system') {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-[#9aa6cc] bg-[#0f1020] border border-[#2a2f5a] rounded-full px-3 py-1">
          {children}
        </span>
      </div>
    );
  }
  const isUser = kind === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug"
        style={{
          background: isUser ? '#1f3a8a' : '#1f2236',
          color: '#e8eaf6',
          border: isUser ? 'none' : '1px solid #2a2f5a',
          borderBottomRightRadius: isUser ? 6 : 16,
          borderBottomLeftRadius: isUser ? 16 : 6,
        }}
      >
        {!isUser && name && (
          <div className="text-xs font-bold mb-0.5" style={{ color: WHATSAPP_GREEN }}>
            {name}
          </div>
        )}
        {isUser && name && <div className="text-xs font-bold mb-0.5 text-[#9db2ff]">{name}</div>}
        <div className="whitespace-pre-line">{children}</div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>
      <p className="text-[#a7b0d0] text-[15px] leading-relaxed">{children}</p>
    </Card>
  );
}

function FaqItem({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left px-5 py-4"
      >
        <span className="font-semibold text-white text-[15px]">{q}</span>
        <span className={`text-[#6e8efb] text-xl transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && <div className="px-5 pb-5 -mt-1 text-[#a7b0d0] text-[15px] leading-relaxed">{a}</div>}
    </Card>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[#9db2ff] bg-[#0f1020] border border-[#2a2f5a] rounded px-1.5 py-0.5 text-[0.92em]">
      {children}
    </code>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#0f1020] text-[#e8eaf6]">
      {/* ── Hero ── */}
      <header className="relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(110% 70% at 50% 0%, rgba(59,91,219,0.22) 0%, rgba(15,16,32,0) 60%)' }}
        />
        <div className="relative max-w-4xl mx-auto px-4 pt-16 pb-14 text-center">
          <img
            src="/logo.png"
            alt="Zetas App"
            className="w-28 h-28 mx-auto mb-6 rounded-full"
            style={{ filter: 'drop-shadow(0 8px 30px rgba(59,91,219,0.5))' }}
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white">Zetas App</h1>
          <p className="mt-4 text-xl sm:text-2xl font-semibold text-[#c5cce6]">
            Tu lista de vóley. Ordenada, justa y sin dramas.
          </p>
          <p className="mt-3 text-base text-[#7c8db5] max-w-2xl mx-auto">
            Organiza quién juega cada fecha directamente desde WhatsApp, con una web en vivo que muestra la lista,
            los cupos, las finanzas y las reglas del grupo. Esta es la guía completa de cómo funciona todo.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold"
              style={{ background: 'rgba(37,211,102,0.14)', color: WHATSAPP_GREEN, border: `1px solid ${WHATSAPP_GREEN}55` }}
            >
              💬 Vive en WhatsApp
            </span>
            <a
              href="#comandos"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#5c7cfa,#3b5bdb)' }}
            >
              Ver comandos ↓
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-24 space-y-24">
        {/* ── Cómo funciona en 4 pasos ── */}
        <section>
          <SectionTitle
            kicker="Lo esencial"
            title="Cómo funciona, en 4 pasos"
            subtitle="No necesitas instalar nada. Todo arranca escribiéndole al bot en el grupo."
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <StepCard n={1} icon="✍️" title="Anótate">
              Cuando se abre la lista, escribe <Code>@Z anótame</Code> en el grupo. Quedas en la lista principal si hay
              cupo, o en la lista de espera si ya está llena.
            </StepCard>
            <StepCard n={2} icon="🧑‍🤝‍🧑" title="Suma a alguien">
              ¿Vienes con alguien más? <Code>@Z invitar Carlos</Code> anota a un invitado externo, o{' '}
              <Code>@Z anótame @amigo</Code> anota a otro miembro del grupo.
            </StepCard>
            <StepCard n={3} icon="⏳" title="Lista de espera">
              Si está llena, entras a la espera. Cuando se libera un cupo, la app{' '}
              <strong className="text-white">sube al siguiente automáticamente</strong> y le avisa para confirmar.
            </StepCard>
            <StepCard n={4} icon="✅" title="Confirma y juega">
              Si te suben de la espera, confirma con <Code>@Z confirmar</Code> para asegurar tu cupo. ¡Y nos vemos en la
              cancha! 🏐
            </StepCard>
          </div>
        </section>

        {/* ── Comandos ── */}
        <section id="comandos" className="scroll-mt-6">
          <SectionTitle
            kicker="Bot de WhatsApp"
            title="Todos los comandos"
            subtitle="Siempre empiezan mencionando al bot con @Z. No importan mayúsculas ni tildes."
          />

          <h3 className="text-[#9db2ff] font-bold text-sm uppercase tracking-wider mb-3">📝 Registro</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <CommandCard color="blue" cmd="@Z anótame" desc="Te anotas en la lista." synonyms="méteme, apúntame, juego, voy, entro, anotar" />
            <CommandCard color="blue" cmd="@Z anótame @persona" desc="Te anotas y anotas a otro miembro del grupo. Los miembros pueden sumar 1 persona; los admins, varias." />
            <CommandCard color="blue" cmd="@Z invitar Nombre" desc="Anotas a un invitado externo (no miembro). Debes estar anotado primero." />
            <CommandCard color="blue" cmd="@Z sácame" desc="Sales de la lista. Si tenías invitados, también salen." synonyms="salirme, quítame, no voy, salgo, salir" />
          </div>

          <h3 className="text-[#8ce0ec] font-bold text-sm uppercase tracking-wider mb-3">📋 Consulta</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <CommandCard color="cyan" cmd="@Z lista" desc="Muestra la lista actual y los cupos disponibles." synonyms="cupos, quiénes van, cuántos" />
            <CommandCard color="cyan" cmd="@Z reglas" desc="Enlace al reglamento completo del grupo." synonyms="reglamento, normas" />
            <CommandCard color="cyan" cmd="@Z finanzas" desc="Enlace al presupuesto, gastos y aportes del grupo." synonyms="presupuesto, plata, dinero" />
            <CommandCard color="cyan" cmd="@Z multados" desc="Lista de personas con multas o deudas pendientes." synonyms="deudores, morosos" />
            <CommandCard color="cyan" cmd="@Z ayuda" desc="Muestra todos los comandos disponibles." synonyms="help, comandos, info" />
          </div>

          <h3 className="font-bold text-sm uppercase tracking-wider mb-3" style={{ color: '#7be8a8' }}>✅ Confirmación</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <CommandCard color="green" cmd="@Z confirmar" desc="Confirmas tu asistencia cuando te suben de la lista de espera. Tienes un tiempo límite para hacerlo." synonyms="confirmo, listo" />
          </div>

          <h3 className="font-bold text-sm uppercase tracking-wider mb-3" style={{ color: '#d29be8' }}>⬆️ Lista de espera</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            <CommandCard color="purple" cmd="@Z promover" desc="Sube al primero de la lista de espera. Lo pueden usar los jugadores que ya están en la principal." synonyms="subir, jalar, meter" />
          </div>

          <h3 className="font-bold text-sm uppercase tracking-wider mb-3" style={{ color: '#f5a097' }}>🔒 Solo administradores</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <CommandCard color="red" cmd="@Z sacar @persona" desc="Saca a alguien de la lista (y a sus invitados)." badge="admin" synonyms="quitar, remover, eliminar" />
            <CommandCard color="red" cmd="@Z confirmar @persona" desc="Confirma la asistencia por otro jugador (útil si no está en WhatsApp en ese momento)." badge="admin" />
            <CommandCard color="red" cmd="@Z terminar" desc="Cierra el partido y genera el reporte final." badge="admin" synonyms="cerrar, finalizar, completar" />
          </div>
        </section>

        {/* ── Lista de espera + auto-promoción ── */}
        <section>
          <SectionTitle
            kicker="La parte inteligente"
            title="Lista de espera y auto-promoción"
            subtitle="Lo que hace que nadie pierda su cupo por estar desconectado."
          />
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <FeatureCard icon="🔁" title="Sube solo, sin que nadie mueva un dedo">
              Cuando alguien sale de la lista principal, la app promueve automáticamente al primero de la espera que sea
              elegible y le manda un mensaje para que confirme.
            </FeatureCard>
            <FeatureCard icon="⏱" title="Ventana de confirmación 15 → 5 min">
              El primero en subir tiene <strong className="text-white">15 minutos</strong> para confirmar. Si no
              responde, el cupo pasa al siguiente con <strong className="text-white">5 minutos</strong>, y así
              sucesivamente. Cada cupo liberado abre su propia “línea” de 15 min.
            </FeatureCard>
            <FeatureCard icon="🙋" title="¿No confirmaste a tiempo?">
              Vuelves a la lista de espera. Si más tarde hay cupo, escribe <Code>@Z anótame</Code> de nuevo y, si hay
              espacio, subes de inmediato a la principal.
            </FeatureCard>
            <FeatureCard icon="🕐" title="Corte de invitados">
              Antes de la hora de corte (por defecto <strong className="text-white">1:30 p. m.</strong>, configurable por
              partido) los invitados siempre van a la espera, para dar prioridad a los miembros. Pasado el corte ya
              pueden tomar cupos libres.
            </FeatureCard>
          </div>
        </section>

        {/* ── Invitados ── */}
        <section>
          <SectionTitle kicker="Trae gente" title="Invitados externos" />
          <Card className="p-6 sm:p-8 space-y-4">
            <p className="text-[#a7b0d0] leading-relaxed">
              Un invitado es alguien que no es miembro del grupo. Lo anotas con{' '}
              <Code>@Z invitar Nombre del invitado</Code> y queda <strong className="text-white">atado a ti</strong>:
            </p>
            <ul className="space-y-2.5 text-[#c5cce6]">
              <li className="flex gap-3"><span className="text-[#6e8efb]">▸</span> Debes estar anotado en la lista para poder invitar.</li>
              <li className="flex gap-3"><span className="text-[#6e8efb]">▸</span> Si sales de la lista, tus invitados salen contigo automáticamente.</li>
              <li className="flex gap-3"><span className="text-[#6e8efb]">▸</span> Antes del corte, los invitados tienen menor prioridad que los miembros y van a la espera.</li>
            </ul>
          </Card>
        </section>

        {/* ── La web app ── */}
        <section>
          <SectionTitle
            kicker="Más allá del chat"
            title="La web en vivo"
            subtitle="Cuando quieras ver el detalle, entra a la app: todo en tiempo real."
          />
          <div className="grid sm:grid-cols-3 gap-4">
            <FeatureCard icon="🟢" title="Lista en vivo">
              Mira quién va, quiénes son invitados, los cupos ocupados y la lista de espera, actualizándose en el momento.
            </FeatureCard>
            <FeatureCard icon="💸" title="Finanzas">
              Saldo del grupo, aportes por fecha y gastos (cancha, vigilante, implementos). Todo transparente.
            </FeatureCard>
            <FeatureCard icon="📋" title="Reglas">
              El reglamento del grupo siempre a la mano, sin buscar mensajes viejos.
            </FeatureCard>
            <FeatureCard icon="👤" title="Tu perfil">
              Tu nombre, foto y estado de cuenta. Lo que el grupo ve de ti.
            </FeatureCard>
            <FeatureCard icon="🏐" title="Reporte del partido">
              Al cerrar la fecha se genera un resumen con quién jugó, invitados y cuentas.
            </FeatureCard>
            <FeatureCard icon="🛠" title="Herramientas de admin">
              Crear fechas, gestionar usuarios, confirmar por otros y llevar las finanzas.
            </FeatureCard>
          </div>
        </section>

        {/* ── Finanzas y multas ── */}
        <section>
          <SectionTitle kicker="Cuentas claras" title="Finanzas y multas" />
          <div className="grid sm:grid-cols-2 gap-4">
            <FeatureCard icon="🧾" title="Aportes y gastos">
              Cada fecha tiene su costo (cancha, vigilante, etc.). La app lleva el registro de quién aportó y en qué se
              gastó el dinero del grupo.
            </FeatureCard>
            <FeatureCard icon="🚫" title="Con deudas no se juega">
              Si tienes multas o deudas pendientes no podrás anotarte hasta ponerte al día con un admin. Consulta el
              estado con <Code>@Z multados</Code>.
            </FeatureCard>
          </div>
        </section>

        {/* ── Ejemplo de un partido real ── */}
        <section>
          <SectionTitle
            kicker="En la práctica"
            title="Así se ve un partido real"
            subtitle="Un sábado típico, de principio a fin, en el grupo de WhatsApp."
          />
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col gap-2.5">
              <ChatBubble kind="system">Lista abierta · Sábado 6x6 · 18 cupos</ChatBubble>

              <ChatBubble kind="user" name="Andrés">@Z anótame</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">✅ Andrés se anotó en la lista principal{'\n'}📊 1/18 cupos</ChatBubble>

              <ChatBubble kind="user" name="Mateo">@Z anótame @Carlos</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">✅ Mateo se anotó{'\n'}✅ Carlos fue anotado por Mateo{'\n'}📊 3/18 cupos</ChatBubble>

              <ChatBubble kind="system">… el resto del grupo se va anotando …</ChatBubble>

              <ChatBubble kind="user" name="Sofía">@Z anótame</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">✅ Sofía se anotó en la lista de espera (puesto 1){'\n'}📊 Lista principal llena (18/18) · 1 en espera</ChatBubble>

              <ChatBubble kind="user" name="Andrés">@Z sácame</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">👋 Andrés salió de la lista.{'\n'}📊 17/18 cupos</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">⬆️ ¡Sofía subió a la lista principal! Confirma con @Z confirmar ⏱ 15 min · no pierdes tu cupo.</ChatBubble>

              <ChatBubble kind="user" name="Sofía">@Z confirmar</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">✅ Sofía confirmó su asistencia 🏐{'\n'}📊 18/18 cupos</ChatBubble>

              <ChatBubble kind="system">— Fin de la jornada —</ChatBubble>
              <ChatBubble kind="user" name="Admin">@Z terminar</ChatBubble>
              <ChatBubble kind="bot" name="Zetas Bot">🏐 Partido cerrado. Reporte generado: 18 jugadores, 2 invitados, cuentas al día. ¡Gracias por jugar!</ChatBubble>
            </div>
          </Card>
        </section>

        {/* ── FAQ ── */}
        <section>
          <SectionTitle kicker="Dudas frecuentes" title="Preguntas rápidas" />
          <div className="space-y-3">
            <FaqItem
              q="¿Tengo que descargar algo?"
              a={<>No. Todo funciona desde el grupo de WhatsApp. La web es opcional, para ver el detalle en vivo.</>}
            />
            <FaqItem
              q="¿Importan las mayúsculas o las tildes?"
              a={<>No. <Code>@Z ANÓTAME</Code>, <Code>@z anotame</Code> o <Code>@Z voy</Code> funcionan igual.</>}
            />
            <FaqItem
              q="Me subieron de la espera pero no vi el mensaje a tiempo, ¿perdí el cupo?"
              a={<>Si no confirmas dentro de la ventana, el cupo pasa al siguiente y tú vuelves a la espera. Si luego hay un cupo libre, escribe <Code>@Z anótame</Code> otra vez para volver a subir.</>}
            />
            <FaqItem
              q="¿Cuántos cupos hay?"
              a={<>Depende de la modalidad: <strong className="text-white">18</strong> en 6x6 y <strong className="text-white">12</strong> en 4x4. El admin lo define al crear la fecha.</>}
            />
            <FaqItem
              q="¿Puedo anotar a varios amigos?"
              a={<>Los miembros pueden sumar 1 persona adicional con <Code>@Z anótame @amigo</Code> e invitados externos con <Code>@Z invitar</Code>. Los admins pueden anotar a varios.</>}
            />
            <FaqItem
              q="¿Por qué no me deja anotarme?"
              a={<>Lo más común es tener multas o deudas pendientes. Revisa con <Code>@Z multados</Code> y ponte al día con un admin.</>}
            />
          </div>
        </section>

        {/* ── CTA final ── */}
        <section className="text-center">
          <Card className="p-8 sm:p-10" style={{ background: 'linear-gradient(135deg, rgba(92,124,250,0.12), rgba(59,91,219,0.06))' }}>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">Menos enredos, más vóley.</h2>
            <p className="text-[#a7b0d0] mb-6">Anótate, juega, disfruta. Nos vemos en la cancha. 🏐</p>
            <span
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-lg"
              style={{ background: 'rgba(37,211,102,0.16)', color: WHATSAPP_GREEN, border: `1px solid ${WHATSAPP_GREEN}66` }}
            >
              💬 Escribe “@Z anótame” en el grupo
            </span>
          </Card>
        </section>
      </main>

      <footer className="border-t border-[#2a2f5a] py-8 text-center text-sm text-[#6b70a0]">
        Zetas App · Zetas Club 2026 🏐
      </footer>
    </div>
  );
}
