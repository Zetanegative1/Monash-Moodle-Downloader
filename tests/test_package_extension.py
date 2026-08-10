import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "package_extension", ROOT / "scripts" / "package_extension.py"
)
PACKAGE_EXTENSION = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(PACKAGE_EXTENSION)


class PackageExtensionTests(unittest.TestCase):
    def test_builds_only_the_runtime_package_files(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            output = Path(temp_directory) / "extension.zip"
            PACKAGE_EXTENSION.package_extension(ROOT, output)

            with ZipFile(output) as archive:
                self.assertEqual(archive.namelist(), list(PACKAGE_EXTENSION.PACKAGE_FILES))
                manifest = json.loads(archive.read("manifest.json"))

            self.assertEqual(manifest["version"], "4.6.1")
            self.assertNotIn("README.md", PACKAGE_EXTENSION.PACKAGE_FILES)
            self.assertFalse(any(name.startswith("tests/") for name in archive.namelist()))

    def test_repeated_builds_are_identical(self):
        with tempfile.TemporaryDirectory() as temp_directory:
            first = Path(temp_directory) / "first.zip"
            second = Path(temp_directory) / "second.zip"
            PACKAGE_EXTENSION.package_extension(ROOT, first)
            PACKAGE_EXTENSION.package_extension(ROOT, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())


if __name__ == "__main__":
    unittest.main()
