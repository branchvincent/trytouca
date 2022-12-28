# Copyright 2022 Touca, Inc. Subject to Apache-2.0 License.

import logging
import sys
from argparse import ArgumentParser
from pathlib import Path

import touca
from touca._runner import run_workflows
from touca.cli._common import Operation

logger = logging.getLogger("touca.cli.check")


class Check(Operation):
    name = "check"
    help = "Submit the test output generated by other applications to the Touca Server"

    @classmethod
    def parser(self, parser: ArgumentParser):
        parser.add_argument(
            "--suite",
            help="name of the suite to associate with this output",
            required=True,
        )
        parser.add_argument(
            "--testcase",
            help="name of the testcase to associate with this output",
            required=False,
        )
        if sys.stdin.isatty():
            parser.add_argument(
                "src",
                help="path to file or directory to submit",
            )

    def __init__(self, options: dict):
        self.__options = options

    def _run(self, *, callback, testcases):
        workflow = {
            "callback": callback,
            "suite": self.__options.get("suite"),
            "testcases": testcases,
        }
        run_workflows({"workflows": [workflow], "arguments": []})

    def _slugify(self, file: Path):
        return (
            str(file.absolute().relative_to(Path.cwd()))
            .replace(".", "_")
            .replace("/", "_")
            .replace("-", "_")
        )

    def _submit_stdin(self):
        def _submit(_):
            touca.check("output", sys.stdin.read())

        testcase = self.__options.get("testcase")
        self._run(
            callback=_submit,
            testcases=[testcase if testcase else "stdout"],
        )
        return True

    def _submit_file(self, file: Path):
        content = file.read_text()

        def _submit(_):
            touca.check("output", content)

        testcase = self.__options.get("testcase")
        self._run(
            callback=_submit,
            testcases=[testcase if testcase else self._slugify(file)],
        )
        return True

    def _get_file_content(self, file: Path):
        try:
            return file.read_text()
        except:
            from hashlib import sha256

            return sha256(file.read_bytes()).hexdigest()

    def _submit_directory(self, directory: Path):
        files = {
            self._slugify(file): file for file in directory.glob("*") if file.is_file()
        }

        def _submit(testcase: str):
            if not self.__options.get("testcase"):
                content = self._get_file_content(files.get(testcase))
                touca.check("output", content)
                return
            for slug, file in files.items():
                touca.check(slug, self._get_file_content(file))

        testcase = self.__options.get("testcase")
        self._run(
            callback=_submit,
            testcases=[testcase] if testcase else list(files.keys()),
        )
        return False

    def run(self) -> bool:
        if not sys.stdin.isatty():
            return self._submit_stdin()
        src = Path(self.__options.get("src"))
        if src.is_file():
            return self._submit_file(src)
        if src.is_dir():
            return self._submit_directory(src)
        logger.error("specified path is neither a directory nor a file")
        return False
