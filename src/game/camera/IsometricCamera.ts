import * as THREE from 'three'

export class IsometricCamera {
  camera: THREE.OrthographicCamera
  private targetZoom = 1
  private currentZoom = 1
  private panOffset = new THREE.Vector2(0, 0)
  private targetPan = new THREE.Vector2(0, 0)

  constructor(aspect: number) {
    const frustum = 12
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect,
      frustum * aspect,
      frustum,
      -frustum,
      0.1,
      100
    )
    // Isometric angle: rotate 45° around Y, then ~35.264° around X
    this.camera.position.set(20, 20, 20)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
  }

  setZoom(zoom: number) {
    this.targetZoom = Math.max(0.3, Math.min(3, zoom))
  }

  getZoom(): number {
    return this.targetZoom
  }

  pan(dx: number, dy: number) {
    this.targetPan.x += dx
    this.targetPan.y += dy
    // Clamp pan
    this.targetPan.x = Math.max(-15, Math.min(15, this.targetPan.x))
    this.targetPan.y = Math.max(-10, Math.min(10, this.targetPan.y))
  }

  resize(aspect: number) {
    const frustum = 12
    const z = this.currentZoom
    this.camera.left = (-frustum * aspect) / z
    this.camera.right = (frustum * aspect) / z
    this.camera.top = frustum / z
    this.camera.bottom = -frustum / z
    this.camera.updateProjectionMatrix()
  }

  update(_dt: number) {
    // Smooth zoom
    this.currentZoom += (this.targetZoom - this.currentZoom) * 0.1
    this.panOffset.x += (this.targetPan.x - this.panOffset.x) * 0.1
    this.panOffset.y += (this.targetPan.y - this.panOffset.y) * 0.1

    const frustum = 12
    const aspect = window.innerWidth / window.innerHeight
    const z = this.currentZoom
    this.camera.left = (-frustum * aspect) / z
    this.camera.right = (frustum * aspect) / z
    this.camera.top = frustum / z
    this.camera.bottom = -frustum / z

    this.camera.position.set(
      20 + this.panOffset.x,
      20,
      20 + this.panOffset.y
    )
    this.camera.lookAt(
      this.panOffset.x,
      0,
      this.panOffset.y
    )
    this.camera.updateProjectionMatrix()
  }
}
