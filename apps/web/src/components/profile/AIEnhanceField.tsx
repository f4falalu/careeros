'use client'
import { useState } from 'react'
import { Sparkles, Check, RotateCcw, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

type FieldType = 'headline' | 'bio' | 'bullets' | 'description' | 'achievement'
type Status = 'idle' | 'loading' | 'enhanced'

interface CommonProps {
  value: string
  onChange: (value: string) => void
  fieldType: FieldType
  context?: { title?: string; company?: string }
  placeholder?: string
  className?: string
  disabled?: boolean
}

interface TextareaProps extends CommonProps {
  as: 'textarea'
  rows?: number
}

interface InputProps extends CommonProps {
  as?: 'input'
}

type AIEnhanceFieldProps = TextareaProps | InputProps

export function AIEnhanceField(props: AIEnhanceFieldProps) {
  const { value, onChange, fieldType, context, placeholder, className = '', disabled } = props
  const [status, setStatus] = useState<Status>('idle')
  const [original, setOriginal] = useState('')

  async function handleEnhance() {
    if (!value.trim() || status === 'loading') return
    setOriginal(value)
    setStatus('loading')
    try {
      const res = await api.profile.enhance({ field_type: fieldType, content: value, context })
      onChange(res.enhanced)
      setStatus('enhanced')
    } catch {
      setStatus('idle')
    }
  }

  function handleAccept() {
    setStatus('idle')
    setOriginal('')
  }

  function handleRevert() {
    onChange(original)
    setStatus('idle')
    setOriginal('')
  }

  const isEnhanced = status === 'enhanced'
  const isLoading = status === 'loading'

  const fieldClass = `${className}${isEnhanced ? ' !border-purple-300 dark:!border-purple-700' : ''}`

  const sharedProps = {
    placeholder,
    value,
    disabled: disabled || isLoading,
    style: { paddingRight: !isEnhanced && value.trim() ? '2rem' : undefined },
    className: fieldClass,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value)
      if (isEnhanced) setStatus('idle')
    },
  }

  return (
    <div className="relative">
      {props.as === 'textarea' ? (
        <textarea {...sharedProps} rows={props.rows ?? 4} />
      ) : (
        <input {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}

      {/* Sparkle enhance button — visible when field has content and not yet enhanced */}
      {!isEnhanced && value.trim() && (
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isLoading || disabled}
          title="Enhance with AI"
          className="absolute top-1.5 right-1.5 p-1 rounded text-[var(--color-faint)] hover:text-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin text-purple-500" />
          ) : (
            <Sparkles size={12} />
          )}
        </button>
      )}

      {/* Accept / Revert row — shown below field after AI enhancement */}
      {isEnhanced && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="flex items-center gap-1 text-[10px] text-purple-500 font-medium">
            <Sparkles size={9} />
            AI enhanced — edit freely
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleRevert}
              className="flex items-center gap-1 h-5 px-2 rounded text-[10px] text-[var(--color-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)] transition-colors"
            >
              <RotateCcw size={9} strokeWidth={2} />
              Revert
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="flex items-center gap-1 h-5 px-2 rounded text-[10px] font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors"
            >
              <Check size={9} strokeWidth={2.5} />
              Accept
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
