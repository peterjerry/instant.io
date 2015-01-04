var dragDrop = require('drag-drop/buffer')
var magnet = require('magnet-uri')
var path = require('path')
var prettysize = require('prettysize')
var thunky = require('thunky')
var toBuffer = require('typedarray-to-buffer')
var upload = require('upload-element')
var WebTorrent = require('webtorrent')
var xhr = require('xhr')

var hash = window.location.hash.replace('#', '')

var log = document.querySelector('.log')
var videos = document.querySelector('.videos')

var getClient = thunky(function (cb) {
  xhr('/rtcConfig', function (err, res) {
    if (err) return cb(err)
    var rtcConfig
    try {
      rtcConfig = JSON.parse(res.body)
    } catch (err) {
      return cb(new Error('Expected JSON response from /rtcConfig: ' + res.body))
    }
    cb(null, new WebTorrent({ rtcConfig: rtcConfig }))
  })
})

getClient(function (err, client) {
  if (err) return error(err)
  window.client = client
})

function download (infoHash) {
  getClient(function (err, client) {
    if (err) return error(err)
    var magnetUri = magnet.encode({
      infoHash: infoHash,
      announce: [ 'wss://tracker.webtorrent.io' ]
    })
    logAppend('using magnet uri: ' + magnetUri)
    client.add(magnetUri, onTorrent)
  })
}

function seed (files) {
  getClient(function (err, client) {
    if (err) return error(err)
    client.seed(files, onTorrent)
  })
}

upload(document.querySelector('input[name=upload]'), { type: 'array' }, onFile)

function onFile (err, results) {
  var files = results.map(function (r) {
    var buf = toBuffer(r.target.result)
    buf.name = r.file.name
    buf.size = r.file.size
    buf.lastModifiedDate = r.file.lastModifiedDate
    buf.type = r.file.type
    return buf
  })
  logAppend('Creating .torrent file...<br>')
  seed(files)
}

dragDrop('body', function (files) {
  logAppend('Creating .torrent file...<br>')
  seed(files)
})

document.querySelector('form').addEventListener('submit', function (e) {
  e.preventDefault()
  download(document.querySelector('form input[name=infoHash]').value)
})

if (/^[a-f0-9]+$/i.test(hash)) {
  download(hash)
}

function onTorrent (torrent) {
  logAppend('Torrent info hash: ' + torrent.infoHash + ' <a href="/#'+torrent.infoHash+'">(link)</a><br>')
  logAppend('Downloading from ' + torrent.swarm.wires.length + ' peers<br>')
  logAppend('progress: starting...')

  torrent.swarm.on('download', function () {
    var progress = (100 * torrent.downloaded / torrent.parsedTorrent.length).toFixed(1)
    logReplace('progress: ' + progress + '% -- download speed: ' + prettysize(torrent.swarm.downloadSpeed()) + '/s<br>')
  })

  torrent.swarm.on('upload', function () {
    logReplace('upload speed:' + prettysize(torrent.swarm.uploadSpeed()) + '/s<br>')
  })

  torrent.files.forEach(function (file) {
    var extname = path.extname(file.name)
    if (extname === '.mp4' || extname === '.webm') {
      var video = document.createElement('video')
      video.controls = true
      videos.appendChild(video)
      file.createReadStream().pipe(video)
    } else {
      file.getBlobURL(function (err, url) {
        if (err) throw err
        var a = document.createElement('a')
        a.download = file.name
        a.href = url
        a.textContent = 'Download ' + file.name
        log.innerHTML += a.outerHTML + '<br>'
      })
    }
  })
}

// append a P to the log
function logAppend (str) {
  var p = document.createElement('p')
  p.innerHTML = str
  log.appendChild(p)
}

// replace the last P in the log
function logReplace (str) {
  log.lastChild.innerHTML = str
}

function error (err) {
  console.error(err)
  alert(err.message || err)
}
