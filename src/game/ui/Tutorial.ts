/**
 * Tutorial tooltip overlay — guides new players through first-time setup.
 * Each step is a dismissible tooltip with optional element highlighting.
 * Steps persist in localStorage so they only appear on first play.
 */

const TUTORIAL_KEY = 'stargate-ship-tutorial-done'

interface TutorialStep {
  /** Unique id for tracking */
  id: string
  /** CSS selector to highlight, or 'center' for centered overlay */
  target: string
  /** Title shown in tooltip */
  title: string
  /** Body text shown in tooltip */
  body: string
  /** Position relative to target */
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  /** Optional: only show this step after a game event */
  trigger?: 'first_module_placed' | 'stargate_core_placed' | 'first_crisis'
}

export class Tutorial {
  private steps: TutorialStep[]
  private currentStep = 0
  private dismissedSteps = new Set<string>()
  private container: HTMLElement | null = null
  private overlay: HTMLElement | null = null
  private active = false

  constructor() {
    this.steps = [
      {
        id: 'welcome',
        target: '#resource-bar',
        title: '🚀 Welcome, Commander!',
        body: 'You\'re in command of a stranded factory ship. Build modules, gather resources, and charge the Stargate to escape!',
        position: 'bottom',
      },
      {
        id: 'resources',
        target: '#res-iron',
        title: '🔩 Resources',
        body: 'Keep an eye on your resources: Iron for building, Crystal for the Stargate, Energy to power modules, and Crew to run them.',
        position: 'bottom',
      },
      {
        id: 'build_btn',
        target: '#btn-build',
        title: '🔨 Building',
        body: 'Tap BUILD to open the module panel. You start with Solar Panels, Storage, and Crew Quarters already placed.',
        position: 'top',
      },
      {
        id: 'stargate',
        target: '#stargate-progress',
        title: '◉ Stargate Progress',
        body: 'Your goal: activate the Stargate! Place the Stargate Core (costs 500 Iron + 200 Crystal) and fill all four resource bars to 100%.',
        position: 'right',
      },
    ]

    // Check if tutorial was already completed
    const done = localStorage.getItem(TUTORIAL_KEY)
    if (done === 'true') return

    // Wait for DOM to be ready
    requestAnimationFrame(() => this.init())
  }

  private init() {
    // Create overlay container
    const overlay = document.createElement('div')
    overlay.id = 'tutorial-overlay'
    overlay.innerHTML = `
      <div id="tutorial-backdrop"></div>
      <div id="tutorial-tooltip">
        <div id="tutorial-arrow"></div>
        <div id="tutorial-header">
          <span id="tutorial-title"></span>
          <button id="tutorial-skip">Skip ✕</button>
        </div>
        <div id="tutorial-body"></div>
        <div id="tutorial-footer">
          <div id="tutorial-progress"></div>
          <button id="tutorial-next">Next →</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    this.container = overlay

    // Stash refs
    this.overlay = overlay

    // Inject styles
    this.injectStyles()

    // Wire buttons
    overlay.querySelector('#tutorial-skip')!.addEventListener('click', () => this.finish())
    overlay.querySelector('#tutorial-next')!.addEventListener('click', () => this.next())

    // Show first step
    this.active = true
    this.showStep(0)
  }

  private injectStyles() {
    if (document.getElementById('tutorial-styles')) return

    const style = document.createElement('style')
    style.id = 'tutorial-styles'
    style.textContent = `
      #tutorial-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        pointer-events: none;
      }
      #tutorial-overlay * { pointer-events: auto; }

      #tutorial-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 10, 26, 0.6);
        transition: opacity 0.4s ease;
      }

      #tutorial-tooltip {
        position: absolute;
        background: rgba(20, 18, 40, 0.97);
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 12px;
        padding: 16px 20px;
        max-width: 320px;
        backdrop-filter: blur(16px);
        box-shadow: 0 4px 32px rgba(124, 58, 237, 0.25), 0 0 60px rgba(124, 58, 237, 0.08);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      #tutorial-tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }

      #tutorial-arrow {
        position: absolute;
        width: 10px;
        height: 10px;
        background: rgba(20, 18, 40, 0.97);
        border: 1px solid rgba(124, 58, 237, 0.4);
        transform: rotate(45deg);
      }
      #tutorial-tooltip.pos-bottom #tutorial-arrow {
        top: -6px;
        left: 50%;
        margin-left: -5px;
        border-bottom: none;
        border-right: none;
      }
      #tutorial-tooltip.pos-top #tutorial-arrow {
        bottom: -6px;
        left: 50%;
        margin-left: -5px;
        border-top: none;
        border-left: none;
      }
      #tutorial-tooltip.pos-right #tutorial-arrow {
        left: -6px;
        top: 20px;
        border-top: none;
        border-right: none;
      }
      #tutorial-tooltip.pos-left #tutorial-arrow {
        right: -6px;
        top: 20px;
        border-bottom: none;
        border-left: none;
      }
      #tutorial-tooltip.pos-center #tutorial-arrow { display: none; }
      #tutorial-tooltip.pos-center {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        text-align: center;
        max-width: 380px;
      }
      #tutorial-tooltip.pos-center.visible {
        transform: translate(-50%, -50%) scale(1);
      }

      #tutorial-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
      }
      #tutorial-title {
        font-size: 16px;
        font-weight: 700;
        color: #c084fc;
        line-height: 1.3;
        padding-right: 8px;
      }
      #tutorial-skip {
        background: none;
        border: none;
        color: rgba(255,255,255,0.35);
        font-size: 12px;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 6px;
        transition: color 0.2s;
        min-width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: -8px -8px -8px 0;
      }
      #tutorial-skip:hover { color: rgba(255,255,255,0.7); }

      #tutorial-body {
        font-size: 14px;
        line-height: 1.5;
        color: #c8c8d8;
        margin-bottom: 14px;
      }

      #tutorial-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #tutorial-progress {
        display: flex;
        gap: 6px;
      }
      .tutorial-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: rgba(255,255,255,0.15);
        transition: background 0.3s;
      }
      .tutorial-dot.active { background: #c084fc; }
      .tutorial-dot.done { background: rgba(124,58,237,0.4); }

      #tutorial-next {
        background: linear-gradient(135deg, #7c3aed, #a855f7);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 600;
        padding: 8px 20px;
        cursor: pointer;
        transition: opacity 0.2s;
        min-height: 44px;
      }
      #tutorial-next:active { opacity: 0.8; }

      /* Highlight ring on targeted element */
      .tutorial-highlight {
        position: relative;
        z-index: 101 !important;
        filter: brightness(1.2);
        transition: filter 0.3s;
      }
    `
    document.head.appendChild(style)
  }

  private showStep(index: number) {
    if (!this.overlay || !this.container) return
    const step = this.steps[index]
    if (!step) { this.finish(); return }

    this.currentStep = index

    // Remove previous highlights
    this.container.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight')
    })

    const tooltip = this.overlay.querySelector('#tutorial-tooltip') as HTMLElement
    const title = this.overlay.querySelector('#tutorial-title')!
    const body = this.overlay.querySelector('#tutorial-body')!
    const nextBtn = this.overlay.querySelector('#tutorial-next')!

    // Set content
    title.textContent = step.title
    body.textContent = step.body

    // Last step gets a "Got it!" button
    const isLast = index >= this.steps.length - 1
    nextBtn.textContent = isLast ? 'Got it! 🚀' : 'Next →'

    // Position tooltip
    tooltip.classList.remove('visible', 'pos-top', 'pos-bottom', 'pos-left', 'pos-right', 'pos-center')

    if (step.position === 'center') {
      tooltip.classList.add('pos-center')
    } else {
      const targetEl = document.querySelector(step.target) as HTMLElement
      if (!targetEl) {
        // Fallback to center if target not found
        tooltip.classList.add('pos-center')
      } else {
        const rect = targetEl.getBoundingClientRect()
        const tw = tooltip.offsetWidth || 300
        const th = tooltip.offsetHeight || 200

        // Highlight the target
        targetEl.classList.add('tutorial-highlight')

        tooltip.classList.add(`pos-${step.position}`)

        switch (step.position) {
          case 'bottom':
            tooltip.style.top = `${rect.bottom + 12}px`
            tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, rect.left + rect.width / 2 - tw / 2))}px`
            break
          case 'top':
            tooltip.style.top = `${Math.max(8, rect.top - th - 12)}px`
            tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tw - 8, rect.left + rect.width / 2 - tw / 2))}px`
            break
          case 'right':
            tooltip.style.top = `${rect.top + rect.height / 2 - th / 2}px`
            tooltip.style.left = `${rect.right + 12}px`
            break
          case 'left':
            tooltip.style.top = `${rect.top + rect.height / 2 - th / 2}px`
            tooltip.style.left = `${Math.max(8, rect.left - tw - 12)}px`
            break
        }
      }
    }

    // Update progress dots
    const progressContainer = this.overlay.querySelector('#tutorial-progress')!
    progressContainer.innerHTML = this.steps.map((_, i) =>
      `<div class="tutorial-dot ${i < index ? 'done' : i === index ? 'active' : ''}"></div>`
    ).join('')

    // Show with animation
    requestAnimationFrame(() => {
      tooltip.classList.add('visible')
    })
  }

  private next() {
    this.dismissedSteps.add(this.steps[this.currentStep].id)
    if (this.currentStep >= this.steps.length - 1) {
      this.finish()
    } else {
      this.showStep(this.currentStep + 1)
    }
  }

  private finish() {
    this.active = false
    if (this.overlay) {
      this.overlay.style.opacity = '0'
      setTimeout(() => {
        this.overlay?.remove()
        this.overlay = null
        this.container = null
        // Remove any remaining highlights
        document.querySelectorAll('.tutorial-highlight').forEach((el) => {
          el.classList.remove('tutorial-highlight')
        })
      }, 400)
    }
    localStorage.setItem(TUTORIAL_KEY, 'true')
  }

  /** Check if tutorial is still active */
  isActive(): boolean {
    return this.active
  }

  /** Force complete the tutorial (e.g. on win) */
  dismiss() {
    if (this.active) this.finish()
  }
}
