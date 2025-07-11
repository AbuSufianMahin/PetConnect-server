const express = require('express')
const app = express()
const port = process.env.POST || 3000;

app.get('/', (req, res) => {
  res.send('Hosting PetConnect server')
})

app.listen(port, () => {
  console.log(`PetConnect is listening on port ${port}`)
})
