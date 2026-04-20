interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon = '🏐', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
      <span className="text-5xl">{icon}</span>
      <div>
        <p className="font-semibold text-lg" style={{ color: 'var(--color-zetas-text)' }}>{title}</p>
        {description && (
          <p className="text-sm mt-1" style={{ color: 'var(--color-zetas-muted)' }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
