import Hammer from 'hammerjs'
import * as THREE from 'three'
import type { IsometricCamera } from '../camera/IsometricCamera'

export type TapHandler = (screenX: number, screenY: number) => void
export type PressHandler = (screenX: number, screenY: number) => void

export class TouchInput {
  private hammer: HammerManager
  private isoCamera: IsometricCamera
  private onTap: TapHandler | null = null
  private onPress: PressHandler | null = null
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private lastPinchScale = 1

  constructor(element: HTMLElement, isoCamera: IsometricCamera) {
    this.isoCamera = isoCamera
    this.hammer = new Hammer.Manager(element, {
      recognizers: [
        [Hammer.Tap, {}],
        [Hammer.Press, { time: 500 }],
        [Hammer.Pinch, { enable: true }],
        [Hammer.Pan, { direction: Hammer.DIRECTION_ALL, pointers: 2 }],
      ],
    })

    this.hammer.on('tap', (e) => {
      this.onTap?.(e.center.x, e.center.y)
    })

    this.hammer.on('press', (e) => {
      this.onPress?.(e.center.x, e.center.y)
    })

    this.hammer.on('pinchstart', () => {
      this.lastPinchScale = this.isoCamera.getZoom()
    })

    this.hammer.on('pinch', (e) => {
      this.isoCamera.setZoom(this.lastPinchScale * e.scale)
    })

    this.hammer.on('pan', (e) => {
      const speed = 0.02 / this.isoCamera.getZoom()
      this.isoCamera.pan(-e.velocityX * speed * 5, -e.velocityY * speed * 5)
    })

    // Mouse wheel zoom for desktop testing
    element.addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      this.isoCamera.setZoom(this.isoCamera.getZoom() + delta)
    }, { passive: false })

    // Mouse drag for desktop testing
    let isDragging = false
    let lastX = 0
    let lastY = 0
    element.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.button === 1) {
        isDragging = true
        lastX = e.clientX
        lastY = e.clientY
      }
    })
    element.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = (e.clientX - lastX) * 0.03
        const dy = (e.clientY - lastY) * 0.03
        this.isoCamera.pan(-dx, -dy)
        lastX = e.clientX
        lastY = e.clientY
      }
    })
    element.addEventListener('mouseup', () => {
      isDragging = false
    })
    element.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  setTapHandler(handler: TapHandler) {
    this.onTap = handler
  }

  setPressHandler(handler: PressHandler) {
    this.onPress = handler
  }

  /** Raycast from screen coordinates into 3D scene */
  raycast(
    screenX: number,
    screenY: number,
    camera: THREE.OrthographicCamera,
    targets: THREE.Object3D[]
  ): THREE.Intersection[] {
    this.mouse.x = (screenX / window.innerWidth) * 2 - 1
    this.mouse.y = -(screenY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, camera)
    return this.raycaster.intersectObjects(targets, true)
  }

  /** Get world position on the Y=0 plane from screen coordinates */
  screenToGround(
    screenX: number,
    screenY: number,
    camera: THREE.OrthographicCamera
  ): THREE.Vector3 | null {
    this.mouse.x = (screenX / window.innerWidth) * 2 - 1
    this.mouse.y = -(screenY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, camera)

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const target = new THREE.Vector3()
    const hit = this.raycaster.ray.intersectPlane(plane, target)
    return hit
  }

  destroy() {
    this.hammer.destroy()
  }
}
