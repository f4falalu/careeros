'use client'
import { useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ProfileSidebar } from '@/components/profile/ProfileSidebar'
import { HeroSection } from '@/components/profile/HeroSection'
import { WorkExperienceSection } from '@/components/profile/WorkExperienceSection'
import { EducationSection } from '@/components/profile/EducationSection'
import { SkillsSection } from '@/components/profile/SkillsSection'
import { ProjectsSection } from '@/components/profile/ProjectsSection'
import { CareerQuestionsSection } from '@/components/profile/CareerQuestionsSection'
import { ResumeImportBanner } from '@/components/profile/ResumeImportBanner'

const SECTION_IDS = ['hero', 'work', 'education', 'skills', 'projects', 'career', 'info']

export default function ProfilePage() {
  const [activeSection, setActiveSection] = useState('hero')

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: api.profile.get,
    staleTime: 30_000,
  })

  const { data: workExps = [] } = useQuery({
    queryKey: ['profile-work'],
    queryFn: api.profile.workExperiences.list,
    staleTime: 30_000,
  })

  const { data: educations = [] } = useQuery({
    queryKey: ['profile-education'],
    queryFn: api.profile.education.list,
    staleTime: 30_000,
  })

  const { data: skills = [] } = useQuery({
    queryKey: ['profile-skills'],
    queryFn: api.profile.skills.list,
    staleTime: 30_000,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['profile-projects'],
    queryFn: api.profile.projects.list,
    staleTime: 30_000,
  })

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )

    for (const id of SECTION_IDS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[18px] font-semibold text-[var(--color-text)]">Profile</h1>
        <p className="text-[13px] text-[var(--color-muted)] mt-0.5">
          Your candidate knowledge base — every AI agent reads from this
        </p>
      </div>

      {/* Resume import */}
      <div className="mb-4">
        <ResumeImportBanner />
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: completion sidebar */}
        <ProfileSidebar
          profile={profile ?? null}
          workExps={workExps}
          educations={educations}
          skills={skills}
          projects={projects}
          activeSection={activeSection}
          onScrollTo={scrollTo}
        />

        {/* Right: main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <HeroSection profile={profile ?? null} />

          <WorkExperienceSection experiences={workExps} />

          <EducationSection educations={educations} />

          <SkillsSection skills={skills} />

          <ProjectsSection projects={projects} />

          <CareerQuestionsSection profile={profile ?? null} />

          {/* Personal Info stub */}
          <section
            id="info"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-5"
          >
            <h2 className="text-[14px] font-semibold text-[var(--color-text)] mb-1">
              Personal Info
            </h2>
            <p className="text-[12px] text-[var(--color-muted)]">
              Location, work authorization, and languages are managed in the{' '}
              <button
                onClick={() => scrollTo('hero')}
                className="underline text-[var(--color-text)] hover:opacity-70"
              >
                Basic Info
              </button>{' '}
              section above.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
