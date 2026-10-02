import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docx_reader import split_inline_options, docx_to_canonical  # noqa: E402
from question_parser import exam_name_from_filename, category_from_name  # noqa: E402


def _p(*runs):
    body = ''.join(f'<w:r><w:t xml:space="preserve">{r}</w:t></w:r>' for r in runs)
    return f'<w:p>{body}</w:p>'


def _make_docx(paragraphs, path):
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           f'<w:body>{"".join(paragraphs)}</w:body></w:document>')
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('word/document.xml', xml)


class SplitOptions(unittest.TestCase):
    def test_equal_words(self):
        o, _ = split_inline_options('أحمد باشا يوسف باشا محمد باشا درغوت باشا', 'أحمد باشا',
                                    labels=['أحمد باشا القرمانلي: ..', 'يوسف باشا: ..'])
        self.assertEqual(o, ['أحمد باشا', 'يوسف باشا', 'محمد باشا', 'درغوت باشا'])

    def test_dates_with_all_of_the_above(self):
        o, _ = split_inline_options('18 نوفمبر 1918م 18 نوفمبر 1920م 20 نوفمبر 1917م جميع الإجابات السابقة خاطئة',
                                    '18 نوفمبر 1918م')
        self.assertEqual(o, ['18 نوفمبر 1918م', '18 نوفمبر 1920م', '20 نوفمبر 1917م',
                             'جميع الإجابات السابقة خاطئة'])

    def test_fixed_phrase_first_and_preposition(self):
        o, _ = split_inline_options('جميع الإجابات السابقة صحيحة الاعتراف بالسيد إدريس أميراً على برقة '
                                    'استقلال الأجزاء الجنوبية من برقة تحديد إجدابيا عاصمة للإمارة',
                                    'جميع الإجابات السابقة صحيحة')
        self.assertEqual(o[1], 'الاعتراف بالسيد إدريس أميراً على برقة')
        self.assertEqual(o[2], 'استقلال الأجزاء الجنوبية من برقة')

    def test_run_delimiters_win(self):
        o, c = split_inline_options('x', 'ب', run_chunks=['أ أ', 'ب', 'ج ج ج', 'د'])
        self.assertEqual((o, c), (['أ أ', 'ب', 'ج ج ج', 'د'], 'exact'))


class FileName(unittest.TestCase):
    def test_names(self):
        self.assertEqual(exam_name_from_filename('/x/الدور الثاني 2017 - 2016.docx'), 'الدور الثاني 2017 - 2016')
        self.assertEqual(exam_name_from_filename('الدور_الأول_2013 (1).docx'), 'الدور الأول 2013')
        self.assertEqual(exam_name_from_filename('b981078d-______2017_-_2016.docx'), '2017 - 2016')
        self.assertEqual(exam_name_from_filename('scan.docx'), '')
        self.assertEqual(category_from_name('الدور الأول 2013'), 'امتحان الدور الأول 2013')
        self.assertEqual(category_from_name('امتحان الدور الأول'), 'امتحان الدور الأول')


class Docx(unittest.TestCase):
    def test_end_to_end(self):
        paras = [
            _p('أولا: أسئلة الصواب والخطأ:'),
            _p('س 1) بدأت الحرب العالمية الأولى عام 1914م.'),
            _p('الإجابة: صح'), _p('الشرح: "..."'),
            _p('توضيح:'), _p('سطر أول: ..'), _p('سطر ثان: ..'),
            _p('المصدر: الباب الأول'), _p('الوقت المثالي لحل السؤال: دقيقة واحدة.'),
            _p('صعوبة السؤال: سهل.'), _p(''),
            _p('س 2) انتهت الحرب عام', ': ', '1918م', ' ', '1917م', ' ', '1919م', ' ', '1910م'),
            _p('الإجابة: 1918م'), _p('الشرح: "..."'), _p('توضيح: ..'), _p('المصدر: ..'),
            _p('الوقت المثالي لحل السؤال: دقيقتان.'), _p('صعوبة السؤال: متوسط.'),
        ]
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 't.docx')
            _make_docx(paras, path)
            text, meta = docx_to_canonical(path)
        self.assertEqual(meta[1]['kind'], 'tf')
        self.assertEqual(meta[2]['kind'], 'mcq')
        self.assertIn('التوضيح: ', text)
        self.assertIn('(د) 1910م', text)
        self.assertNotIn('أولا', text)


if __name__ == '__main__':
    unittest.main()
