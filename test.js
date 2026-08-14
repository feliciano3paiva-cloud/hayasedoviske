export default new class extends SubtitleSource {
  async test() {
    return true
  }

  async single(query) {
    return []
  }
}
