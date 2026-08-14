export default new class TesteLegendas {
  async test() {
    return true
  }

  async single(query) {
    return [
      {
        url: "https://raw.githubusercontent.com/feliciano3paiva-cloud/hayasedoviske/main/test.srt",
        language: "BR"
      }
    ]
  }
}()
