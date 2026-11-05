"""Build the sponsorship packet on a shared print grid, retaining the user's cover."""
from io import BytesIO
from pathlib import Path
import json

from PIL import Image, ImageOps
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path(__file__).parent / 'assets'
OUT = ROOT / 'output/pdf/Cornell-GeoData-Sponsorship-2026-2027.pdf'
W, H, MARGIN = 612, 792, 36
BODY, LEADING, SECTION, TITLE, CAPTION = 14.5, 19, 21, 36, 10.5
WHITE, BLACK = HexColor('#ffffff'), HexColor('#000000')

pdfmetrics.registerFont(TTFont('Serif', str(ROOT/'public/fonts/source-serif-4.ttf')))
pdfmetrics.registerFont(TTFont('SerifBold', str(ROOT/'public/fonts/source-serif-4-bold.ttf')))
pdfmetrics.registerFontFamily('Serif', normal='Serif', bold='SerifBold')
pdfmetrics.registerFont(TTFont('Heavy', '/System/Library/Fonts/Supplemental/Arial Black.ttf'))
roster = json.loads((ROOT/'src/data/members.json').read_text())
students = len({m.get('email') or m['name'] for m in roster if m.get('role') != 'Faculty Advisor'})
contact = next(m for m in roster if m.get('subteam') == 'Business' and m.get('lead'))

OUT.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
c.setTitle('Cornell GeoData | Sponsorship 2026-2027')
c.setAuthor('Cornell GeoData')
c.setSubject('Student-built instruments, environmental research, and sponsorship opportunities')


def rect(x, y, w, h, color=WHITE):
    c.setFillColor(color)
    c.rect(x, H-y-h, w, h, stroke=0, fill=1)


def text(value, x, y, size=BODY, font='Serif', align='left', color=WHITE, align_with=None):
    """Align visible capitals to the grid, sharing a baseline for mixed-font rows."""
    c.setFillColor(color)
    c.setFont(font, size)
    baseline = H-y-pdfmetrics.getFont(align_with or font).face.capHeight*size/1000
    draw = {'left': c.drawString, 'right': c.drawRightString, 'center': c.drawCentredString}[align]
    draw(x, baseline, value)


def paragraph(value, x, y, width, max_height, size=BODY, leading=LEADING):
    p = Paragraph(value, ParagraphStyle('body', fontName='Serif', fontSize=size,
                  leading=leading, textColor=WHITE, splitLongWords=False))
    _, height = p.wrap(width, H)
    assert height <= max_height, (value[:60], height, max_height)
    assert y+height <= 740, (value[:60], y+height)
    p.drawOn(c, x, H-y-height)
    return height


def photo(path, x, y, width, height, contain=False, center=(0.5, 0.5)):
    """Fit real source photographs into the document's frames, without stretching."""
    source = Image.open(path).convert('RGB')
    pixels = (round(width*3), round(height*3))
    if contain:
        fitted = ImageOps.contain(source, pixels, Image.Resampling.LANCZOS)
        source = Image.new('RGB', pixels, 'white')
        source.paste(fitted, ((pixels[0]-fitted.width)//2, (pixels[1]-fitted.height)//2))
    else:
        source = ImageOps.fit(source, pixels, Image.Resampling.LANCZOS, centering=center)
    stream = BytesIO()
    source.save(stream, format='JPEG', quality=94)
    rect(x-2, y-2, width+4, height+4)
    c.drawImage(ImageReader(stream), x, H-y-height, width=width, height=height)


def link(value, target, x, y, size=BODY):
    text(value, x, y, size)
    c.linkURL(target, (x, H-y-size*1.25, x+pdfmetrics.stringWidth(value, 'Serif', size), H-y+3))


def page(number, heading):
    rect(0, 0, W, H)
    rect(9, 9, W-18, H-18, BLACK)
    assert pdfmetrics.stringWidth(heading, 'Heavy', TITLE) <= W-2*MARGIN
    text(heading, MARGIN, 36, TITLE, 'Heavy')
    text('CORNELL GEODATA  /  SPONSORSHIP 2026-2027', MARGIN, 757, CAPTION)
    text(f'{number:02d} / 06', W-MARGIN, 757, CAPTION, align='right')
    c.bookmarkPage(str(number))
    c.addOutlineEntry(heading.title(), str(number), level=0)


# 01. The cover is the user's original design, including the institution wordmark.
c.drawImage(str(ASSETS/'cover.png'), 0, 0, width=W, height=H)
c.bookmarkPage('1'); c.addOutlineEntry('Sponsorship 2026-2027', '1', level=0)
c.showPage()

# 02. One column of prose, one badge block, and a full-width team photograph.
page(2, 'WHO WE ARE')
paragraph(f'GeoData is a Cornell Engineering project team of {students} students. We design, build, and deploy our own sensors to study the air, water, and ground around the Finger Lakes.',
          36, 108, 340, 95)
paragraph('We have six subteams: Air, Water, Rock, Data, Tech, and Business. Our members study computer science, environmental engineering, physics, atmospheric science, statistics, and more. Together, we build real instruments, analyze field data, and learn to understand and protect our environment.',
          36, 210, 340, 133)
c.drawImage(str(ASSETS/'subteam-badges.png'), 400, H-366, width=176, height=260)
photo(ROOT/'public/team.jpg', 36, 389, 540, 322, center=(0.5, 0.66))
text('TEAM PHOTO 2026', 306, 723, CAPTION, 'Heavy', align='center')
c.showPage()

# 03. The purpose of sponsorship has its own page, with room for the actual work.
page(3, 'WHY SPONSOR US?')
paragraph('Your support puts sensors, parts, and research tools into students\' hands. It funds the fabrication and fieldwork that turn an idea into an instrument, and its measurements into useful data.',
          36, 108, 540, 76)
photo(ROOT/'public/projects/nisar.webp', 36, 211, 260, 336)
text('Student fieldwork at a soil-moisture station', 36, 561, CAPTION)
paragraph('Fieldwork connects what we build in the lab with the environments we study.',
          36, 602, 260, 57)
for y, heading, copy in [
    (214, 'Build practical skills', 'Students design circuits, fabricate parts, write software, and troubleshoot instruments outdoors. Your support helps them take responsibility for a complete engineering project.'),
    (370, 'Support local research', 'Help us measure the air, water, and soil around the Finger Lakes. Contributions fund sensors, field materials, and reliable systems for collecting environmental data.'),
    (526, 'Meet our students', 'Connect with engineers and scientists through the team resume book, project visibility, and recruiting opportunities included in your sponsorship level.'),
]:
    text(heading, 324, y, SECTION)
    paragraph(copy, 324, y+36, 252, 114)
c.showPage()

# 04. The pyramid keeps the original colors; the offer is set in spacious rows.
page(4, 'SPONSORSHIP LEVELS')
paragraph('Choose a level of support. Each higher level includes the benefits of the preceding levels.',
          36, 108, 350, 57)
paragraph('We also welcome equipment, fabrication services, and technical expertise. Contact us to discuss an in-kind contribution.',
          36, 174, 350, 57)
colors = ['#811ac6', '#c92556', '#c1703f', '#6d9dcd']
apex, bottom, middle, width = 104, 232, 507, 138
for i, color in enumerate(colors):
    top = apex+i*32+(1.5 if i else 0)
    low = apex+(i+1)*32-1.5
    a, b = width*(top-apex)/(bottom-apex)/2, width*(low-apex)/(bottom-apex)/2
    p = c.beginPath()
    p.moveTo(middle-a, H-top); p.lineTo(middle+a, H-top)
    p.lineTo(middle+b, H-low); p.lineTo(middle-b, H-low); p.close()
    c.setFillColor(HexColor(color)); c.drawPath(p, fill=1, stroke=0)
tiers = [
    ('QUARTZ', '$500+', '#6d9dcd', 'Team resume book; a decal on a soil-moisture node at the Game Farm site; a thank-you in the alumni newsletter.'),
    ('TOPAZ', '$1,500+', '#c1703f', 'Includes Quartz, plus a Cayuga Lake sensor-station decal and deployment-day photo; a logo on our website; a field feature on social media.'),
    ('RUBY', '$3,000+', '#c92556', 'Everything in Topaz, plus a tethersonde decal flown to 500 feet; logo on team apparel; job postings in the alumni newsletter; an info session or recruiting event with the team.'),
    ('DIAMOND', '$5,000+', '#811ac6', 'Everything in Ruby, plus decals on the LiDAR hexapod and survey drone; a lake sensor site named after you; first invite to demo day.'),
]
for i, (name, amount, color, copy) in enumerate(tiers):
    y = 266+i*112
    rect(36, y, 5, 19, HexColor(color))
    text(name, 54, y, SECTION, 'Heavy')
    text(amount, 576, y, SECTION, align='right', align_with='Heavy')
    paragraph(copy, 54, y+32, 522, 57)
paragraph('We will coordinate recognition, events, and project timing with you.', 36, 716, 540, 19)
c.showPage()

# 05. Three matched image/text rows with one body size and consistent alignment.
page(5, 'OUR CURRENT PROJECTS')
projects = [
    (108, 'LiDAR Hexapod', 'With Cornell Physical Intelligence, we are developing a six-legged robot for environmental surveys. LiDAR, cameras, and autonomous navigation will support mapping across uneven terrain. The latest design is learning to walk in simulation ahead of a physical build.',
     'hexapod-design.jpg', 'Design visualization; robot in development', False),
    (320, 'Cayuga Buoy Station', 'We are refitting a research buoy to monitor weather and water quality on Cayuga Lake. Sensors above and below the surface will measure lake and atmospheric conditions together. The refit includes mooring, power, and telemetry systems.',
     'buoy-refit.jpg', 'Refitting the research buoy', True),
    (532, 'Atmospheric Sensors', 'Our student-built tethersonde measures how temperature, humidity, pressure, and wind change with height. Alongside it, we build weather stations using UCAR\'s open-source 3DPAWS design. These instruments help us study boundary-layer and lake-effect weather around Ithaca.',
     'tethersonde-field.jpg', 'Preparing for atmospheric fieldwork', False),
]
for y, heading, copy, image, caption, image_left in projects:
    tx, ix = (308, 36) if image_left else (36, 332)
    text(heading, tx, y, SECTION)
    paragraph(copy, tx, y+32, 268, 152)
    photo(ASSETS/image, ix, y, 244, 164, contain=image.startswith('hexapod'))
    text(caption, ix, y+176, CAPTION)
c.showPage()

# 06. Two contact groups: the person to talk to, then the continuing connection.
page(6, 'WANT TO LEARN MORE?')
paragraph('For sponsorships, equipment contributions, and project partnerships, start a conversation with our Business team.',
          36, 108, 540, 57)
photo(ROOT/'public'/contact['photo'].lstrip('/'), 36, 184, 152, 228)
text(contact['name'].upper(), 216, 186, SECTION, 'Heavy')
text('Business Lead', 216, 223)
paragraph(f'{contact["name"].split()[0]} can walk you through the sponsorship levels and help find the right project for your organization.',
          216, 265, 360, 57)
link('cugeodata@cornell.edu', 'mailto:cugeodata@cornell.edu?subject=GeoData%20Sponsorship%202026-2027', 216, 340, SECTION)
link(contact['email'], 'mailto:'+contact['email'], 216, 381, SECTION)
text('EXPLORE GEODATA', 36, 468, SECTION, 'Heavy')
link('cornellgeodata.com', 'https://cornellgeodata.com', 36, 509, SECTION)
link('Instagram: @cugeodata', 'https://www.instagram.com/cugeodata/', 36, 554)
link('LinkedIn: CU GeoData', 'https://www.linkedin.com/company/cu-geodata/', 36, 586)
qr = QrCodeWidget('https://cornellgeodata.com/#/sponsors')
b = qr.getBounds(); size = 108
d = Drawing(size, size, transform=[size/(b[2]-b[0]), 0, 0, size/(b[3]-b[1]), 0, 0]); d.add(qr)
rect(468, 509, size, size)
renderPDF.draw(d, c, 468, H-617)
c.linkURL('https://cornellgeodata.com/#/sponsors', (468, H-617, 576, H-509))
text('Sponsorship details', 522, 631, CAPTION, align='center')
c.drawImage(str(ROOT/'public/logo.png'), 36, H-726, width=48, height=48, mask='auto')
text('Cornell GeoData', 104, 681, SECTION)
text('A Cornell Engineering Project Team', 104, 713)
c.showPage()

c.save()
print(OUT)
