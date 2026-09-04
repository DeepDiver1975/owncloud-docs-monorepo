package main

import (
	"bufio"
	"fmt"
	"flag"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"strconv"
)

// define the directories used
// note that services and output have a counterpart in .gitignore
// note that other required constants are defined in 'read_env_file.go'
const base_dir        = "../content/ocis/"
const ocis_dir        = "../../ocis/"
const folder_mode     = "0774"
const file_mode       = "0664"
const services_folder = "services"
const output_folder   = "output"

// the antora module the 'copy' task writes into
const module_folder   = "modules/admin"

// the target of the 'copy' task inside the module folder above.
// note that 'examples' is an antora family folder, the subfolder below is free to choose
const examples_folder = "examples/ocis_helpers"

// do not change the contents here
var services_dir      = "/" + services_folder + "/"
var output_dir        = "/" + output_folder + "/"
var examples_dir      = "/" + module_folder + "/" + examples_folder + "/"

// the ocis version given on the command line, it matches the directory of content/ocis/<version>
var ocis_version     string

func main() {

	var err error

	verboseP := flag.Bool("v", false, "Enable verbosity")
	removeP  := flag.Bool("r", false, "Do not remove output directory when finished")
	dryrunP  := flag.Bool("d", false, "Dryrun, generate but do not write files (task 'deltas' only)")
	helpP    := flag.Bool("h", false, "Print help message")

	flag.Usage = func() {
		// if an unknown flag has been provided
		printUsage()
		os.Exit(1)
	}

	// parse the flags
	flag.Parse()

	isVerbose := *verboseP
	isRemove  := !*removeP
	isDryrun  := *dryrunP
	isHelp    := *helpP

	// if flag is set, print help text and exit
	if isHelp {
		printUsage()
		os.Exit(0)
	}

	// get positional argument list
	positionalArgs := flag.Args()

	// required: <version> <task>
	if len(positionalArgs) < 2 {
		fmt.Println("You need to provide the ocis version and the task as argument. Use help for more details.\n")
		os.Exit(0)
	}

	// check if the ocis repo has been cloned locally
	// no colors, added in a later step
	_, err = os.Stat(ocis_dir)
	if err != nil {
		fmt.Printf("The required ocis repo cant be found locally at: %s\n", ocis_dir)
		os.Exit(1)
	}

	// check if the ocis version directory exists
	// no colors, added in a later step
	ocis_version = positionalArgs[0]
	version_dir := base_dir + ocis_version
	_, err = os.Stat(version_dir)
	if err != nil {
		fmt.Printf("The ocis version folder %s does not exist, exiting.\n", version_dir)
		os.Exit(1)
	}

	services_dir = version_dir + services_dir
	output_dir   = version_dir + output_dir
	examples_dir = version_dir + examples_dir

	createEnvFile(isVerbose, isRemove)

	// do tasks based on task entered
	switch positionalArgs[1] {
		case "service":
			haveYouSwitched()
			prepareDirectories()
			RenderServices()
		case "rogue":
			haveYouSwitched()
			prepareDirectories()
			GetRogueEnvs()
		case "extended":
			RenderRogueEnvs()
		case "deltas":
			RenderEnvVarDeltas(isDryrun)
		case "copy":
			CopyToExamples()
		case "cleanup_s":
			cleanupServiceDir()
		case "cleanup_h":
			cleanupHelperDir()
		default:
			fmt.Fprintf(os.Stderr, "Unknown task: %s\n\n", positionalArgs[1])
			printUsage()
			os.Exit(1)
	}

	removeEnvFile()
}

// create the .env file
// isVerbose and isRemove are provided by flags defined above
func createEnvFile(isVerbose bool, isRemove bool) {

	// pre-create basic directories, subdirectories will be added on the fly
	var err error

	// with the checks here, we do not need checks in follow up code
	// get permissions from string
	x := uint64(0)
	x, err = strconv.ParseUint(folder_mode, 8, 32)
	if err != nil {
		log.Fatal(err)
	}
	fm := os.FileMode(x)

	// get permissions from string - for testing purposes only if the string is valid
	y := uint64(0)
	y, err = strconv.ParseUint(file_mode, 8, 32)
	if err != nil {
		log.Fatal(err)
	}
	_ = y

	// write functional vars to a file: .env
	// required to be read by go and the templates
	// the file will be overwritten if exists
	envContent := fmt.Sprintf("IS_VERBOSE=%t\nIS_REMOVE=%t\nSERVICES_DIR=%s\nOUTPUT_DIR=%s\nOCIS_DIR=%s\nFOLDER_MOD=%s\nFILE_MOD=%s\n",
		isVerbose, isRemove, services_dir, output_dir, ocis_dir, folder_mode, file_mode)
	err = os.WriteFile(".env", []byte(envContent), fm)
	if err != nil {
		log.Fatal(err)
	}

	// read the written and provide the variables as in other go files for consistent usage
	ReadEnv()
}

// create the output and services directory if not exists
func prepareDirectories() {

	var err error

	// create output folder if not exists
	err = os.MkdirAll(output_dir, Env.folder_mode)
	if err != nil {
		log.Fatal(err)
	}

	// create services folder if not exists
	err = os.MkdirAll(services_dir, Env.folder_mode)
	if err != nil {
		log.Fatal(err)
	}
}


// CopyToExamples copies all subfolders of the services folder to the examples folder of the
// ocis version processed. the services folder is not tracked, the examples folder is, which
// makes the generated files usable by the docs build.
// note that 'persistent_files' is excluded, it holds sources and no generated content
func CopyToExamples() {

	fmt.Printf(Green+"Copy the subfolders of %s to %s\n\n"+Reset, services_dir, examples_dir)

	entries, err := os.ReadDir(services_dir)
	if err != nil {
		log.Fatalf("Failed reading %s: %+v", services_dir, err)
	}

	for _, entry := range entries {
		// only subfolders are copied, files on the top level are none of our business
		if !entry.IsDir() {
			continue
		}

		// the persistent folder is the source of the generated content and must not be copied
		if entry.Name() == strings.TrimSuffix(persistent_files, "/") {
			continue
		}

		source := filepath.Join(services_dir, entry.Name())
		target := filepath.Join(examples_dir, entry.Name())

		// remove a former copy first, else files that are no longer generated would stay
		err = os.RemoveAll(target)
		if err != nil {
			log.Fatalf("Failed removing the former copy %s: %+v", target, err)
		}

		fmt.Printf("  %-18s %3d files copied\n", entry.Name()+"/", copyDir(source, target))
	}

	fmt.Printf("\nSuccess, see files copied to: %s\n", examples_dir)

	RemoveOutputDir()
}

// copyDir copies a folder recursively and returns the number of files copied
func copyDir(source string, target string) int {

	count := 0

	err := filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// the path walked is relative to the source and gets appended to the target
		destination := filepath.Join(target, strings.TrimPrefix(path, source))

		if entry.IsDir() {
			return os.MkdirAll(destination, Env.folder_mode)
		}

		count++
		return CopyFile(path, destination)
	})
	if err != nil {
		log.Fatalf("Failed copying %s to %s: %+v", source, target, err)
	}

	return count
}


func cleanupServiceDir() {

	var err error
	var folder string

	fmt.Printf(Magenta + "Remove the content of non persistent subfolders in %s \n", services_dir + Reset)

    // adoc
    folder = services_dir + adoc_files + "*"
    err = removeGlob(folder)
    if err != nil {
        log.Fatalf("Error removing files: %+v", err)
    }

    // extended
    folder = services_dir + extened_files + "*"
    err = removeGlob(folder)
    if err != nil {
        log.Fatalf("Error removing files: %+v", err)
    }

    // yaml
    folder = services_dir + yaml_files + "*"
    err = removeGlob(folder)
    if err != nil {
        log.Fatalf("Error removing files: %+v", err)
    }

    // delta files
    folder = services_dir + delta_files + "*"
    err = removeGlob(folder)
    if err != nil {
        log.Fatalf("Error removing files: %+v", err)
    }
}

// cleanupHelperDir removes the folder the 'copy' task writes to, including the folder itself.
// note that only the subfolder defined by 'examples_folder' is removed and not the whole
// examples folder of the module which contains content of other origin
func cleanupHelperDir() {

	var err error

	fmt.Printf(Magenta + "Remove the folder %s \n" + Reset, examples_dir)

	// using os.Stat catches all other errors than "does not exist"
	_, err = os.Stat(examples_dir)
	if err != nil {
		fmt.Printf("Nothing to do, the folder does not exist\n")
		return
	}

	err = os.RemoveAll(examples_dir)
	if err != nil {
		log.Fatalf("Error removing the folder: %+v", err)
	}
}

// remove the content of a folder if exists
func removeGlob(path string) (err error) {

	contents, err := filepath.Glob(path)
	if err != nil {
		return
	}

	for _, item := range contents {
		err = os.RemoveAll(item)
		if err != nil {
			return
		}
	}
	return
}

func RemoveOutputDir() {

	var err error

	// if removal should be omitted
	if Env.isRemove {
		// first remove the output directory
		fmt.Println(Magenta + "Cleaning up (remove output directory if exists) \n" + Reset)

		// note that output_dir is relative to the working directory (parent directory)
		// using os.Stat catches all other errors than "does not exist"
		_, err = os.Stat(Env.output_dir)
		if err == nil {
			err = os.RemoveAll(Env.output_dir)
			if err != nil {
				fmt.Println(err)
			}
		}

	} else {
		fmt.Println(Magenta + "No cleanup (output directory is kept) \n" + Reset)
	}
}

// remove the .env file if exists which is on the same lavel of main.go 
func removeEnvFile() {

	var err error

	_, err = os.Stat(".env")
	if err == nil {
		err = os.Remove(".env")
		if err != nil {
			fmt.Println(err)
		}
	}
}

func CopyFile(src, dst string) error {

	// Open the source file
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer sourceFile.Close()

	// Create the destination file
	destinationFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer destinationFile.Close()

	// Copy the content
	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	// set the correct permissions
	err = os.Chmod(dst, Env.file_mode)
	if err != nil {
		log.Fatal(err)
	}

	// Flush file metadata to disk
	err = destinationFile.Sync()
	if err != nil {
		return fmt.Errorf("failed to sync destination file: %w", err)
	}

	return nil
}


func printUsage() {

	fmt.Printf("Usage: go run . <flags> <version> <task>\n\n")
	fmt.Printf("Optional command line flags:\n")
	flag.PrintDefaults()
	fmt.Printf("\nThe version is mandatory and must match the directory of content/ocis/<version>\n")

	fmt.Printf("\nAvailable tasks:\n")
	fmt.Printf("  service:   generate service envvar tables\n")
	fmt.Printf("  rogue:     create/update the extended_vars.yaml file\n")
	fmt.Printf("  extended:  generate extended_configvars table\n")
	fmt.Printf("  deltas:    generate the added, deprecated and removed envvar tables\n")
	fmt.Printf("  copy:      copy the subfolders of %s to %s except 'persistent_files'\n", services_dir, examples_dir)
	fmt.Printf("  cleanup_s: cleanup folders in %s except 'persistent_files'. run service, extended, deltas to recreate\n", services_dir)
	fmt.Printf("  cleanup_h: remove the folder %s. folder contents is build relevant for antora\n\n", examples_dir)
}

func haveYouSwitched() {

	question := fmt.Sprintf("Have you switched in the ocis repo to 'stable-%s' ? ", ocis_version)

	if askForConfirmation(question) {
		return
	} else {
		os.Exit(0)
	}
}

// ask for the confirmation
func askForConfirmation(s string) bool {

	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Printf("%s [y/n]: ", s)

		response, err := reader.ReadString('\n')
		fmt.Printf("\n")
		if err != nil {
			log.Fatal(err)
		}

		response = strings.ToLower(strings.TrimSpace(response))

		if response == "y" || response == "yes" {
			return true
		} else {
			return false
		}
	}
}
