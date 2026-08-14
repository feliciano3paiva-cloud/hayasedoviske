export default new class extends SubtitleSource {
  async test() {
    return true
  }

  single({ episode, titles }) {
    return [
      {
        url: "https://raw.githubusercontent.com/feliciano3paiva-cloud/hayasedoviske/main/test.srt",
        language: "BR"
      }
    ]
  }
}
