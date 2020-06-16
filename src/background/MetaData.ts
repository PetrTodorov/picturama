import exifr from 'exifr'

import { ExifOrientation, ExifData } from 'common/CommonTypes'
import { isArray } from 'common/util/LangUtil'

import { fsStat } from 'background/util/FileUtil'


export interface MetaData {
    imgWidth?:     number
    imgHeight?:    number
    camera?:       string
    exposureTime?: number
    iso?:          number
    aperture?:     number
    focalLength?:  number
    createdAt?:    Date
    /** Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html */
    orientation:   ExifOrientation
    tags:          string[]
}


// exifr can improve performance, if options object is cached
// See: https://github.com/MikeKovarik/exifr#tips-for-better-performance
const metadataExifrOptions = {
    translateValues: false,
    pick: [
        'CreateDate', 'DateTime', 'DateTimeOriginal', 'ExifImageHeight', 'ExifImageWidth', 'ExposureTime', 'FNumber',
        'FocalLength', 'ImageHeight', 'ImageWidth', 'ISO', 'Make', 'Model', 'ModifyDate', 'Orientation',
    ]
}
const fullExifrOptions = {
    mergeOutput: false,

    // Segments
    tiff: true,
    ifd1: true,
    exfif: true,
    gps: true,
    interop: true,
    jfif: true,
    iptc: true,
    xmp: true,
    icc: true,
    makerNote: true,
    userComment: true,
}


export async function readMetadataOfImage(imagePath: string): Promise<MetaData> {
    try {
        const exifTags = await exifr.parse(imagePath, metadataExifrOptions)
            // We need `translateValues: false`, because we want a numeric `Orientation`, not something like `'Horizontal (normal)'`
        return extractMetaDataFromExif(exifTags)
    } catch (error) {
        console.log(`Reading EXIF data from ${imagePath} failed - continuing without. Error: ${error.message}`)

        const stat = await fsStat(imagePath)
        return {
            createdAt: stat.birthtime,
            orientation: 1,
            tags: []
        }
    }
}


export function getExifData(imagePath: string): Promise<ExifData | null> {
    return exifr.parse(imagePath, fullExifrOptions)
}


const simplifiedBrandNames: { [K in string]: string } = {
    'CASIO COMPUTER CO.,LTD.': 'CASIO',
    'NIKON CORPORATION': 'Nikon',
    'OLYMPUS IMAGING CORP.': 'Olympus'
}

function extractMetaDataFromExif(exifTags: { [K: string]: any }): MetaData {
    // Examples:
    //   - Make = 'Canon', Model = 'Canon EOS 30D'  ->  'Canon EOS 30D'
    //   - Make = 'SONY', Model = 'DSC-N2'  ->  'SONY DSC-N2'
    //   - Make = 'NIKON CORPORATION', Model = 'NIKON D7200'  ->  'Nikon D7200'
    //   - Make = 'OLYMPUS IMAGING CORP.', Model = 'E-M10'  ->  'Olympus E-M10'
    //   - Make = 'CASIO COMPUTER CO.,LTD.', Model = 'EX-Z5      '  ->  'CASIO EX-Z5'
    let cameraBrand: string | null = exifTags.Make
    let cameraModel: string | null = exifTags.Model
    let camera = cameraModel
    if (cameraBrand && cameraModel) {
        cameraBrand = cameraBrand.trim()
        cameraBrand = simplifiedBrandNames[cameraBrand] || cameraBrand

        if (cameraModel.toLowerCase().indexOf(cameraBrand.toLowerCase()) === 0) {
            cameraModel = cameraModel.substring(cameraBrand.length)
        }
        cameraModel = cameraModel.trim()

        camera = `${cameraBrand} ${cameraModel}`
    }
    //console.log(`## Make = '${exifTags.Make}', Model = '${exifTags.Model}'  ->  '${camera}'`)

    let iso: number | undefined = undefined
    if (typeof exifTags.ISO === 'number') {
        iso = exifTags.ISO
    } else if (exifTags.ISO instanceof Uint16Array && exifTags.ISO.length > 0) {
        // Sometimes `exifTags.ISO` is something like `new Uint16Array([ 200, 0 ])`
        iso = exifTags.ISO[0]
    }

    const metaData: MetaData = {
        imgWidth:     exifTags.ImageWidth || exifTags.ExifImageWidth,
        imgHeight:    exifTags.ImageHeight || exifTags.ExifImageHeight,
        camera:       camera || undefined,
        exposureTime: exifTags.ExposureTime,
        iso,
        aperture:     exifTags.FNumber,
        focalLength:  exifTags.FocalLength,
        createdAt:    exifTags.DateTimeOriginal || exifTags.DateTime || exifTags.CreateDate || exifTags.ModifyDate,
        orientation:  exifTags.Orientation || 1,
            // Details on orientation: https://www.impulseadventure.com/photo/exif-orientation.html
        tags:         []
    }

    return metaData
}
