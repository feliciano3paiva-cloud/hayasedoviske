export default new class Teste {
  async single(query) {
    return [{
      title: 'TESTE HAYASE - EXTENSÃO FUNCIONANDO',
      link: 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
      hash: '0000000000000000000000000000000000000000',
      seeders: 999,
      leechers: 0,
      downloads: 999,
      size: 123456789,
      date: new Date(),
      verified: true,
      type: 'alt',
      accuracy: 'high'
    }]
  }

  batch = this.single
  movie = this.single

  async test() {
    return true
  }
}()
