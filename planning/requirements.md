# Requirements for the Visual Code extension Really Awesome Management of ROS (RAMROS)

## Functional Requirements

* Untersucht den oder die aktuell geöffneten Ordner in VSCode. Diese sollen als Workspace eines ROS2 Projekts angenommen werden
* Überprüft, ob eine ROS Installation gefunden wird (Humble, Jazzy, ...)
* Untersucht die im Workspace vorhandenen Ordner nach ROS2 Paketen und darin enthaltenen Nodes, Launch Files, Messages, Services, Actions. Dabei wird der <src> Ordner im Workspace als Quellordner für diese Informationen herangezogen
* Es können sowohl Python Pakete, als auch C++ Pakete erkannt werden.
* Innerhalb jedes Pakets soll aufgelistet werden, welche nodes, Messages, Launch Files vorhanden sind.
* Möglichkeit neue Pakete im Workspace zu erstellen
  * Abfrage, ob C++ oder Python Paket
  * Abfrage des Namens
* Möglichkeit neue Nodes in einem Paket zu erstellen
  * Abfrage des Namens
  * Abfrage der Abhängigkeiten
  * Abfrage ob c++ oder Python (wenn nicht durch das Paket vorgegeben)
  * Erstellung der notwendigen Dateien mit initialem code (Auswahl ob leer oder simples Beispiel als Vorlage)
* Möglichkeit neue Launch-Files in einem Paket zu erstellen
  * Evtl. durch einfaches anklicken der verfügbaren Nodes im aktuellen Workspace
* Möglichkeit neue Message/Actions/Services in einem Paket zu erstellen
  * Direkte Aufnahme in das CMake-File
  * Soll nur bei Packages angeboten werden, bei denen auch CMake verwendet wird, also nicht bei  reinem ament-python Paketen.
* Egal was erstellt wird, es sollen alle notwentigen Ändeurngen in CMakeLists Files, setup.py-Files oder package.xml dautomatisiert durchgeführt werden
  * Beispielsweise soll beim hinzufügen eines Python-Nodes auch der Entry-Point automatisch eingefügt werden.
* Möglichkeit des direkten Bauen des Projekts (colcon build --symlink-install)
* Möglichkeit einzelne Pakete zu bauen (colcom build -packages-select)
* Möglichkeit einen Knoten zu starten. (evtl mit der Abfrage, ob parameter übergeben werden sollen)
  * Dabei soll wenn es in einem neuen Terminal gestartet wird der Workspace gesourced werden
* Möglichkeit den workspace zu sourcen (source install/setup.bash)
  * Wenn dies nicht vorhanden ist, dann den Hinweis ausgeben, dass das Projekt erst gebaut werden muss
* Die Default Ordner-Struktur soll folgenermaßen sein
  - < workspace >
    * < src >
      * < package1_python >
        * setup.py
        * package.xml
        * < launch >
          * < launch1.launch.py >
        * < package1 >
          * < node1.py >
          * < node2.py >
      * < package2_interfaces >
        * < msg >
        * < srv >
        * < actions >
        * CMakeLists.txt
      * < package3_cpp >
        * tdb
* Wenn das Projekt bereits gebaut wurde, also die Ordner < install >, < build > und < log > vorhanden sind, so sollen Knoten nicht doppelt aufgelistet werden, nur weil sie dort auch vorhanden sind.
## Nonfunctional Requirements
* Eine Übersichtliche Baumstruktur des workspaces
  * Worskpace
    * Package1
      * Node1
      * Node2
      * Node3
      * ...
    * Package2
      * Message1
      * ...
* Hinter den KnNodesoten soll direkt ein Button (Play-Symbol) dargestellt werden, das den Node startet
* Wenn man die Nodes weiter ausklappt, sollen weitere Informationen des Nodes angezeigt werden
  * Node1
    * Subscribers
    * Publisher
    * Parameter
