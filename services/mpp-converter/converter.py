"""Read a Microsoft Project schedule and return it as normalized JSON.

MPXJ (Java) does the reading; this module maps its object model onto the JSON shape
the app stores. Everything here is pure mapping — no HTTP, no database.
"""
from __future__ import annotations

import glob
import os
from typing import Any

_JVM_READY = False


def _is_java_home(path: str | None) -> bool:
    if not path:
        return False
    return any(
        os.path.isfile(os.path.join(path, "bin", exe))
        for exe in ("java.exe", "java")
    )


def find_java_home() -> str:
    """Locate a JRE. A machine-wide JAVA_HOME is ranked below our own because it
    often points at a bundled runtime (Android Studio's JBR) that cannot load MPXJ."""
    candidates: list[str | None] = [os.environ.get("MPP_JAVA_HOME")]
    candidates += sorted(glob.glob(os.path.join(os.path.expanduser("~"), ".local", "jre", "*")), reverse=True)
    candidates.append(os.environ.get("JAVA_HOME"))
    try:
        import jdk4py
        candidates.append(str(jdk4py.JAVA_HOME))
    except ImportError:
        pass

    for candidate in candidates:
        if _is_java_home(candidate):
            return candidate

    raise RuntimeError(
        "No Java runtime found. Set MPP_JAVA_HOME or unpack a JRE under ~/.local/jre. "
        "The runtime must include jdk.charsets and a headless java.desktop — MPXJ needs "
        "both to read .mpp. Temurin works; jdk4py and GraalVM native images do not."
    )


def start_jvm() -> None:
    """Boot the JVM once per process. Safe to call repeatedly."""
    global _JVM_READY
    if _JVM_READY:
        return

    os.environ["JAVA_HOME"] = find_java_home()
    import jpype
    import mpxj  # noqa: F401  (puts the MPXJ jars on the JVM classpath)

    if not jpype.isJVMStarted():
        jpype.startJVM(
            # the JVM would otherwise size its heap against the whole machine, which
            # overshoots a 512MB container and gets the process killed mid-conversion
            f"-Xmx{os.environ.get('MPP_JVM_XMX', '256m')}",
            # MPXJ touches java.awt.Color while parsing Gantt view data
            "-Djava.awt.headless=true",
            "-Dlog4j2.loggerContextFactory=org.apache.logging.log4j.simple.SimpleLoggerContextFactory",
        )
    _JVM_READY = True


def _iso(value: Any) -> str | None:
    return str(value) if value is not None else None


def _num(value: Any) -> float | int | None:
    """Java Number -> plain Python number, integral when whole."""
    if value is None:
        return None
    d = float(value.doubleValue())
    return int(d) if d.is_integer() else d


def _duration(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    return {"amount": float(value.getDuration()), "units": str(value.getUnits())}


def _text(value: Any) -> str | None:
    return str(value) if value else None


def _task(task: Any) -> dict[str, Any]:
    predecessors = []
    for rel in task.getPredecessors():
        source = rel.getPredecessorTask()
        if source is None:
            continue
        predecessors.append({
            "taskUniqueId": _num(source.getUniqueID()),
            "type": str(rel.getType()),
            "lag": _duration(rel.getLag()),
        })

    resources = []
    for assignment in task.getResourceAssignments():
        resource = assignment.getResource()
        if resource is None:
            continue
        resources.append({
            "resourceUniqueId": _num(resource.getUniqueID()),
            "name": _text(resource.getName()),
            "units": _num(assignment.getUnits()),
            "work": _duration(assignment.getWork()),
        })

    parent = task.getParentTask()
    return {
        "id": _num(task.getID()),
        "uniqueId": _num(task.getUniqueID()),
        "wbs": _text(task.getWBS()),
        "name": _text(task.getName()),
        "outlineLevel": _num(task.getOutlineLevel()),
        "parentUniqueId": _num(parent.getUniqueID()) if parent is not None else None,
        "start": _iso(task.getStart()),
        "finish": _iso(task.getFinish()),
        "actualStart": _iso(task.getActualStart()),
        "actualFinish": _iso(task.getActualFinish()),
        "duration": _duration(task.getDuration()),
        "work": _duration(task.getWork()),
        "percentComplete": _num(task.getPercentageComplete()),
        "milestone": bool(task.getMilestone()),
        "summary": bool(task.getSummary()),
        "critical": bool(task.getCritical()),
        "notes": _text(task.getNotes()),
        "predecessors": predecessors,
        "resources": resources,
    }


def convert(path: str) -> dict[str, Any]:
    """Read any format MPXJ understands (.mpp, .mpt, .mpx, .xml, .xer) into JSON."""
    start_jvm()
    from org.mpxj.reader import UniversalProjectReader

    project = UniversalProjectReader().read(path)
    if project is None:
        raise ValueError("not_a_project_file")

    props = project.getProjectProperties()
    return {
        "schema": 1,
        "file": os.path.basename(path),
        "properties": {
            "name": _text(props.getName()),
            "title": _text(props.getProjectTitle()),
            "startDate": _iso(props.getStartDate()),
            "finishDate": _iso(props.getFinishDate()),
            "statusDate": _iso(props.getStatusDate()),
            "author": _text(props.getAuthor()),
            "company": _text(props.getCompany()),
        },
        "resources": [
            {
                "uniqueId": _num(r.getUniqueID()),
                "name": _text(r.getName()),
                "type": _text(r.getType()),
                "group": _text(r.getGroup()),
                "emailAddress": _text(r.getEmailAddress()),
            }
            for r in project.getResources()
            if r.getName()
        ],
        "tasks": [
            _task(t) for t in project.getTasks()
            if t.getUniqueID() is not None
        ],
    }
