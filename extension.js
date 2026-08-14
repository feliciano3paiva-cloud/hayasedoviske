export default new class OpenSubtitles {
  async single(query) {
    return []
  }

  batch = this.single
  movie = this.single

  async test() {
    return true
  }
}()
